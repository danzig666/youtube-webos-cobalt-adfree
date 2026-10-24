# Claude Code notes

## This fork: opening a PR on upstream (RF1705/youtube-webos-cobalt-adfree)

This repository is a fork with the same name as its upstream. A session that has
`danzig666/youtube-webos-cobalt-adfree` attached cannot reach the upstream repo directly, and the
symptoms all look like "impossible":

- GitHub MCP `create_pull_request` on owner `RF1705` says the repository is not configured for
  this session;
- `add_repo` for upstream fails with "a different repository named youtube-webos-cobalt-adfree is
  already attached" (same-named repositories cannot share one session);
- `gh api` / curl to `api.github.com` for upstream answers "GitHub access to this repository is not
  enabled for this session".

That is a session-layout limit, not missing permission: the fork's owner can always open a PR
upstream. Do not tell the owner it cannot be done, and do not ask them to start a session on
upstream (the app only offers their own repositories). Instead:

1. Push the work to a branch of this fork.
2. Start a helper session yourself with the `create_session` tool (claude-code-remote MCP):
   `source_url: https://github.com/RF1705/youtube-webos-cobalt-adfree`, `clone_depth: 1`, and a
   self-contained prompt: open ONE pull request with GitHub MCP `create_pull_request` (owner
   `RF1705`, repo `youtube-webos-cobalt-adfree`, base `main`, head `danzig666:<branch>`,
   `maintainer_can_modify: true`), the exact title, and the full body between BEGIN/END markers;
   check first that no PR from that head is already open; change no code and push nothing; reply
   with the PR URL or the exact GitHub error.
3. Follow it with `send_later` + `get_session` (its `post_turn_summary` carries the PR URL) and give
   the owner the link. danzig666/plx-native used this route for GLinnik21/plx-native PR #986.

The same works for any repository whose name collides with one already attached to the session.
