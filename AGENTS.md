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

- Multi-company auth uses no database: companies live in the master Google Sheet `MASTER_SPREADSHEET_ID` (src/lib/google.server.ts), read live on every login so manual sheet edits take effect immediately; sessions are HMAC-signed httpOnly cookies (SESSION_SECRET). Why: user wants everything in Google Sheets, no Cloud/Supabase.
- Passwords are stored as visible plain text in the sheet's text-formatted "Senha" column (owner's explicit request, so they can edit them); legacy pbkdf2$ hashes are still accepted and replaced by plain text on next login. Reset = e-mail + company name match (no e-mail sending available).
- Each company gets its own spreadsheet created via the Google Drive connector (drive.file scope only sees files the app created), then filled via the Sheets connector; every sheet server fn must take the spreadsheet id from `requireSession()`, never from client input.
