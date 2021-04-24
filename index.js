const core = require("@actions/core");
const github = require("@actions/github");
const JiraClient = require("jira-connector");

const parseJiraIssueKey = (value) => {
  const reg = /^((?!([A-Z0-9a-z]{1,10})-?$)[A-Z]{1}[A-Z0-9]+-[1-9][0-9]*)/g;
  const match = value.match(reg);
  return match ? match[0] : match;
};

const formatMessages = (messages) => {
  return messages
    .filter(Boolean)
    .map((message) => `- ${message.replace(/\n\n/g, ' ')}`)
    .join("\n");
};

const getUpdatedDescription = (a, b)=>{
  const reg = /---(.*?|\r\n)*---/g;
  const match = a.match(reg);
  return match ? a.replace(match[0], b) : a + '\n' + b;
}

(async () => {
  try {
    const jiraHost = core.getInput("jiraHost");
    const jiraEmail = core.getInput("jiraEmail");
    const jiraToken = core.getInput("jiraToken");
    const githubToken = core.getInput("githubToken");

    const octokit = github.getOctokit(githubToken);

    const { data: commits } = await octokit.pulls.listCommits({
      owner: github.context.payload.pull_request.base.repo.owner.login,
      repo: github.context.payload.pull_request.base.repo.name,
      pull_number: github.context.payload.pull_request.number,
    });

    const jiraIssueKeys = [];
    const mergeCommitMessages = [];
    const otherCommitMessages = [];

    commits.forEach(({ commit }) => {
      const jiraKey = parseJiraIssueKey(commit.message);
      if (jiraKey) {
        jiraIssueKeys.push(jiraKey);
        return;
      }

      if(commit.message.toLowerCase().includes('merge')){
        mergeCommitMessages.push(commit.message);
        return 
      }

      otherCommitMessages.push(commit.message);
    });

    const jira = new JiraClient({
      host: jiraHost,
      basic_auth: {
        email: jiraEmail,
        api_token: jiraToken,
      },
    });

    const jiraCommitMessages = await Promise.all(
      [...new Set(jiraIssueKeys)].map(async (issueKey) => {
        try {
          const issue = await jira.issue.getIssue({ issueKey });
          return `<a href="https://${jiraHost}/browse/${issueKey}">${issueKey}</a>: ${issue.fields.summary}`;
        } catch (err) {
          return;
        }
      })
    );

    const { data: { body: oldDescription } } = await octokit.pulls.get({
      owner: github.context.payload.pull_request.base.repo.owner.login,
      repo: github.context.payload.pull_request.base.repo.name,
      pull_number: github.context.payload.pull_request.number,
    });

    const newDescription = `

---
### Jira changes
${formatMessages(jiraCommitMessages)}

### Other changes
${formatMessages(otherCommitMessages)}

### Merges
${formatMessages(mergeCommitMessages)}
---
`;  

    await octokit.pulls.update({
      owner: github.context.payload.pull_request.base.repo.owner.login,
      repo: github.context.payload.pull_request.base.repo.name,
      pull_number: github.context.payload.pull_request.number,
      body: getUpdatedDescription(oldDescription, newDescription),
    });
  } catch (err) {
    core.setFailed(err.message);
  }
})();
