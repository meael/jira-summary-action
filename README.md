# Jira summary action

This action creates Jira summary in pull request description

## Usage details

Your commits should include Jira ticket key  
Example commit name: `FE-100 optional commit text`  
*`FE-100` in example is ticket key from Jira*

## Inputs

Set it in `repository settings -> secrets`

### `JIRA_TOKEN`
**Required** Jira account api token  
[You can create it here](https://id.atlassian.com/manage-profile/security/api-tokens)

### `JIRA_EMAIL`
**Required** Jira account email (Example: `example@example.com`)

### `JIRA_HOST`
**Required** Jira host (Example: `someworkspace.atlassian.net`)

## Example usage

Place code below in repository root `/.github/workflows/main.yml`

```yaml
on:
  pull_request:
    types: [opened, synchronize]

jobs:
  jira_summary_job:
    runs-on: ubuntu-latest
    name: A job to get pull request summary
    steps:
    - name: Jira summary
      uses: meael/jira-summary-action@1.2.0
      with:
        githubToken: ${{ secrets.GITHUB_TOKEN }}
        jiraHost: ${{ secrets.JIRA_HOST }}
        jiraEmail: ${{ secrets.JIRA_EMAIL }}
        jiraToken: ${{ secrets.JIRA_TOKEN }}
```
