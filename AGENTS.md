# Project Instructions

## Telegram Ping Rule

When a task is completed, send a short ping through the existing OpenClaw Telegram so that the openclaw agent can read your latest output and give the user a summary.

Only send this when the prompt was preppended with [P].

Run:

```bash
openclaw agent \
  --session-id fae687b4-fac0-43ef-a27c-2647306aa646 \
  --channel telegram \
  --message "Check tmux. Check tmux: ${TMUX:-unknown}" \
  --deliver \
  --reply-to -1003727091860
```

## Direct Commands Rule

DO NEVER ASK THINGS LIKE THIS:

So the next concrete step is for me to launch the Windows Tauri shell from PowerShell and inspect what happens. If you want, I’ll do that now.

IF THAT'S THE NEXT CONCRETE STEP THEN YEAH DO IT. 

When the local user clearly wants concrete commands, steps, or copy-pasteable instructions, provide them directly in the same reply.

Do not end with a needless offer like "if you want, I can give you the exact commands" when that intent is already obvious from the user's request or context.

Prefer filling in realistic paths, shells, and command sequences instead of making the user ask twice.
