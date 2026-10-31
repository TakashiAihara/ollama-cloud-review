# ollama-cloud-review

A GitHub Action that reviews a pull request with [opencode](https://github.com/anomalyco/opencode) on an [Ollama Cloud](https://ollama.com/pricing) model and posts the review as one comment in Japanese.

- You name the model; there is no default.
- The agent can only read: it runs as opencode's `plan` agent with no shell, no file edits, no web fetch or search, and no paths outside the repository except the PR's diff, which a step writes beforehand. The repository's own opencode config (`opencode.json`, `.opencode/`), its `.claude/skills` and `.agents/skills`, and `CLAUDE.md` files are not loaded, so a PR cannot widen these. An `AGENTS.md` or `CONTEXT.md` in a subdirectory, including one the PR adds, is still attached when the agent reads a file there; opencode has no switch for them.
- opencode's session (prompts, replies, tool calls, and the model's reasoning when it gives any) and its log are uploaded as the artifact `ollama-cloud-review-logs`, kept 14 days, for tuning the prompt. The session holds the PR's diff and the files the agent read, and a public repository's artifacts can be downloaded by anyone signed in. The step drops the bundle instead if it contains the API key or the GitHub token, or if that check fails.
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
      - uses: TakashiAihara/ollama-cloud-review@v1
        with:
          model: glm-5.3-flash
          api-key: ${{ secrets.OLLAMA_API_KEY }}
```

`@v1` is a major tag moved by hand to each 1.x release. Releases are immutable, so `@v1.0.0` (or its commit SHA) pins exactly what you reviewed.

### Inputs

| Input | Required | Default | What it is for |
|---|---|---|---|
| `model` | yes | none | Ollama Cloud model, as opencode's `ollama-cloud` provider names it |
| `api-key` | yes | none | Ollama API key |
| `github-token` | no | `github.token` | The token opencode comments with; needs `pull-requests: write` and `issues: write` (the comment goes through the issues API) |
| `opencode-version` | no | `1.19.5` | opencode release to run, `1.Y.Z` |

There are no outputs; the result is the comment on the PR and the artifact.

`model` is a name opencode's `ollama-cloud` provider knows ([models.dev](https://models.dev)); a name only in https://ollama.com/api/tags fails. `glm-5.3-flash` above is an example, not a default: it is the model that found both bugs below (as opencode Zen's free variant), and on Ollama Cloud it needs purchased usage credits. Run it on `pull_request` only: on `pull_request_target` a fork's PR would run with your key.

## Review instructions per path

To give the reviewer guidance for some files, add `.github/ollama-cloud-review.yaml`. It takes the same shape as CodeRabbit's [`reviews.path_instructions`](https://docs.coderabbit.ai/reference/configuration), so entries can be copied from a `.coderabbit.yaml` as long as their globs avoid the syntax listed below:

```yaml
reviews:
  path_instructions:
    - path: "**/*.ts"
      instructions: |
        Point out a try/catch that swallows an error.
    - path: ".github/workflows/**"
      instructions: |
        Check that third-party actions are pinned to a commit SHA.
```

- Only entries whose `path` glob matches a file changed by the pull request are passed to the reviewer, with the matched files listed. For those files they decide what the reviewer checks over the general review prompt, so an entry can ask for checks the prompt leaves out, such as style. The output format and the read-only rules stay.
- Globs are matched by git's `:(glob)` pathspec, not CodeRabbit's minimatch. `**/*.ts` matches `a.ts` at the root too, and `src` matches everything under `src/`. Braces (`**/*.{ts,js}`), extglob (`+(a|b)`), and a leading `!` or `#` are not supported and fail the job; split or rewrite such an entry. A `{` is refused even inside `[...]`.
- The file is read from the base branch, not the pull request, so a pull request cannot edit it to change its own review. An edit to the file takes effect once it is merged.
- The job fails when the file has no `reviews.path_instructions` list (a misspelt `reviews` or `path_instructions`, or `path_instructions` at the top level), when an entry lacks `path` or `instructions` or has instructions over 20000 characters, and when the file is not valid YAML. An entry that is not a map, or a `path` starting with `/`, also fails the job, with jq's or git's own error instead of a pointed one. Other keys are ignored, so a misspelt key next to the list is not caught. The run log says how many entries were read and which matched.
- This is separate from `AGENTS.md`, which the reviewer does not load at the repository root. An `AGENTS.md` or `CONTEXT.md` in a subdirectory, including one the pull request adds, is still attached when the reviewer reads a file there; opencode has no setting to stop that. `CLAUDE.md` is not loaded.

## Limits

- Without purchased credits only a few models answer; the rest return 402 "not included in your free usage" (observed 2026-10-29). The pricing page no longer mentions free usage or its size, and it has changed within days, so check before relying on it. One review was 3 to 5 model requests in the trial below.
- Ollama states no spending cap for an API key. A leaked key with credits behind it can spend them; without credits it reaches the models above only.
- The action checks out the PR itself (full history, cleaning the workspace), so put it first in the job.
- Public repositories only for now: opencode fetches the PR branch without credentials.
- opencode is pinned by `opencode-version` (default `1.19.5`) and checked against the sha256 GitHub records for the release; only immutable 1.x releases are taken, since 2.x has no `github run` command. Linux x64 runners only, with `git`, `gh`, `jq` and `curl` on PATH, plus mikefarah `yq` v4 when the repository has `.github/ollama-cloud-review.yaml` (GitHub-hosted Ubuntu runners have them).
- opencode 1.x is the only line this runs on. If opencode stops releasing 1.x, the action stays on the last 1.x release until the review step is rewritten for 2.x.
- The model reads the PR's diff and messages, so text in them can steer what the review says. With no shell and no edits, the comment is the only thing it writes.

## Free models tried (2026-10)

Each model reviewed a replay of one pull request with two known bugs, once; only two of the models that answer without credits were tried. The bugs sit in a file outside the diff that the agent can read. opencode Zen's `glm-5.3-flash-free` found both; `glm-5.3-flash` on Ollama Cloud needs purchased credits.

| Model | Known bugs found | Files it opened |
|---|---|---|
| `gemma4:31b` | 0 of 2 | the diff only |
| `gpt-oss:120b` | 0 of 2 | the diff, the changed CSS and test |

Models that answered without purchased credits on 2026-10-27: `gemma4:31b`, `gpt-oss:120b`, `gpt-oss:20b`, `nemotron-3-nano:30b`, `nemotron-3-super`, `nemotron-3-ultra`, `beam`.

## License

MIT. opencode (MIT) is downloaded at run time from its GitHub release, not included here.
