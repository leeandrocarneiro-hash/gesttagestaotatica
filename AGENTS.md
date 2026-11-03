<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Multi-company auth uses no database: companies (with PBKDF2 password hashes) live in the master Google Sheet `MASTER_SPREADSHEET_ID` (src/lib/google.server.ts); sessions are HMAC-signed httpOnly cookies (SESSION_SECRET). Why: user wants everything in Google Sheets, no Cloud/Supabase.
- Each company gets its own spreadsheet created via the Google Drive connector (drive.file scope only sees files the app created), then filled via the Sheets connector; every sheet server fn must take the spreadsheet id from `requireSession()`, never from client input.
