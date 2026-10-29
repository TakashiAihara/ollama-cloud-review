# ollama-cloud-review

A GitHub Action that reviews a pull request with [opencode](https://github.com/anomalyco/opencode) on an [Ollama Cloud](https://ollama.com/pricing) model and posts the review as one comment in Japanese.

- You name the model; there is no default.
- The agent can only read: it runs as opencode's `plan` agent with no shell, no file edits, no web fetch or search, and no paths outside the repository except the PR's diff, which a step writes beforehand. The repository's own opencode config (`opencode.json`, `.opencode/`) is not loaded, so a PR cannot widen these.
- opencode's session (prompts, replies, tool calls, and the model's reasoning when it gives any) and its log are uploaded as the artifact `ollama-cloud-review-logs`, kept 14 days, for tuning the prompt. The step drops them instead if they contain the API key.
- Ollama states that prompts and responses to cloud models are never logged or trained on ([pricing FAQ](https://ollama.com/pricing)).

## Use

1. Create an API key at https://ollama.com/settings/keys and add it as the repository secret `OLLAMA_API_KEY`.
2. Add `.github/workflows/ollama-cloud-review.yml`:

```yaml
name: ollama-cloud-review

on:
  pull_request:
    types: [opened, synchronize, reopened]

permissions:
  contents: read

jobs:
  review:
    # Fork PRs get no secrets, and opencode refuses bot actors.
    if: >-
      github.event.pull_request.head.repo.full_name == github.repository &&
      !endsWith(github.actor, '[bot]')
    runs-on: ubuntu-latest
    timeout-minutes: 15
    # A push makes the review of the previous head pointless.
    concurrency:
      group: ollama-cloud-review-${{ github.event.pull_request.number }}
      cancel-in-progress: true
    permissions:
      contents: read
      pull-requests: write
      issues: write
    steps:
      - uses: TakashiAihara/ollama-cloud-review@main
        with:
          model: glm-5.3-flash
          api-key: ${{ secrets.OLLAMA_API_KEY }}
```

`model` is a name from https://ollama.com/api/tags. `glm-5.3-flash` above is an example, not a default: it is the model that found both bugs below (as opencode Zen's free variant), and on Ollama Cloud it needs purchased usage credits. Run it on `pull_request` only: on `pull_request_target` a fork's PR would run with your key.

## Limits

- On the Free plan only a few models answer (others return 402), there is a monthly starter amount whose size Ollama does not publish, and one request runs at a time; more are queued. One review was 3 to 5 model requests in the trial below.
- Public repositories only for now. opencode fetches the PR branch without credentials, and the opencode binary the action installs is the latest release, not a pinned one.
- The model reads the PR's diff and messages, so text in them can steer what the review says. With no shell and no edits, the comment is the only thing it writes.

## Free models tried (2026-10)

Each model reviewed a replay of a pull request with two known bugs. Both sit in a file outside the diff that the agent can read. opencode Zen's `glm-5.3-flash-free` found both; `glm-5.3-flash` on Ollama Cloud is not in the Free plan.

| Model | Known bugs found | Files it opened |
|---|---|---|
| `gemma4:31b` | 0 of 2 | the diff only |
| `gpt-oss:120b` | 0 of 2 | the diff, the changed CSS and test |

Models that answered on the Free plan on 2026-10-27: `gemma4:31b`, `gpt-oss:120b`, `gpt-oss:20b`, `nemotron-3-nano:30b`, `nemotron-3-super`, `nemotron-3-ultra`, `beam`.
