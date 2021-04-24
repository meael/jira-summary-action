const core = require("@actions/core");
const github = require("@actions/github");
const JiraClient = require("jira-connector");

const isDevMode = process.argv.slice(2)[0] === '--dev';

let config = {
  jiraHost: core.getInput("jiraHost"),
  jiraEmail: core.getInput("jiraEmail"),
  jiraToken: core.getInput("jiraToken"),
  githubToken: core.getInput("githubToken"),
}

if (isDevMode) {
  try {
    const { overrides, inputs } = require("./devConfig.json");
    config = { ...config, ...inputs };
    github.context.payload = overrides.github.context.payload
  } catch (err) {
    console.error('dev config error: ', err.message);
  }
}

const parseJiraIssueKey = (value) => {
  const reg = /((?!([A-Z0-9a-z]{1,10})-?$)[A-Z]{1}[A-Z0-9]+-[1-9][0-9]*)/g;
  const match = value.match(reg);
  return match ? match[0] : match;
};

const formatCommitMessages = (messages) => {
  return messages
    .filter(Boolean)
    .map((message) => `- ${message.replace(/\n\n/g, ' ')}`)
    .join("\n");
};

const getUpdatedPullDescription = (pullDescription, pullChangelog) => {
  const reg = /<!-- generated changes start -->(.*?|\n|\r\n)*<!-- generated changes end -->/g;
  const match = pullDescription.match(reg);
  return match ? pullDescription.replace(match[0], pullChangelog) : pullDescription + '\n' + pullChangelog;
}

(async () => {
  try {
    const { jiraHost, jiraEmail, jiraToken, githubToken } = config;

    const owner = github.context.payload.pull_request.base.repo.owner.login;
    const repo = github.context.payload.pull_request.base.repo.name;
    const pull_number = github.context.payload.pull_request.number;

    const octokit = github.getOctokit(githubToken);

    const { data: commits } = await octokit.pulls.listCommits({
      owner,
      repo,
      pull_number,
    });

    const jiraIssueKeys = [];
    const otherCommitMessages = [];

    commits.forEach(({ commit: { message } }) => {
      const jiraIssueKey = parseJiraIssueKey(message);

      if (jiraIssueKey && !jiraIssueKeys.includes(jiraIssueKey)) {
        jiraIssueKeys.push(jiraIssueKey);
        return;
      }

      if (!otherCommitMessages.includes(message)) otherCommitMessages.push(message);
    });

    const jira = new JiraClient({
      host: jiraHost,
      basic_auth: {
        email: jiraEmail,
        api_token: jiraToken,
      },
    });

    const jiraCommitMessages = await Promise.all(
      jiraIssueKeys.map(async (issueKey) => {
        try {
          const issue = await jira.issue.getIssue({ issueKey });
          return `<a href="https://${jiraHost}/browse/${issueKey}">${issueKey}</a>: ${issue.fields.summary}`;
        } catch (err) {
          return `${issueKey}: ${commits.filter((c) => c.includes(issueKey)).join("; ")}`
        }
      })
    );

    const { data: { body: pullDescription } } = await octokit.pulls.get({
      owner,
      repo,
      pull_number,
    });

    const pullChangelog = `
<!-- generated changes start -->
### Changelog
${formatCommitMessages(jiraCommitMessages)}
${formatCommitMessages(otherCommitMessages)}
<!-- generated changes end -->
`;

    await octokit.pulls.update({
      owner: github.context.payload.pull_request.base.repo.owner.login,
      repo: github.context.payload.pull_request.base.repo.name,
      pull_number: github.context.payload.pull_request.number,
      body: getUpdatedPullDescription(pullDescription, pullChangelog),
    });
  } catch (err) {
    core.setFailed(err.message);
  }
})();
