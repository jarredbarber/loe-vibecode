---
description: Check the latest show for issues.
---

This workflow builds a report of the latest show.

- **Locate the latest show:** Find the most recent directory in `content/shows`.
- **Verify References:** Check that all segment files are correctly referenced in the `show.md` file using the `{filename}` syntax.
- **Check Metadata:** Ensure all show and segment files have the following metadata populated and reasonable:
  - title
  - date
  - category
  - megaphone_id
  - image_url
  - image_caption
  - summary
- **Check Images & Captions:**
  - Verify every image has a caption.
  - Read captions for grammar issues, sentence fragments, or awkward phrasing.
- **Validate URLs:**
  - Check that all `image_url` fields and inline Markdown links return a 200 status code.
  - *Tip: Use a Python script with `urllib` (to avoid dependency issues) or `curl` to batch check these.*
- **Validate Audio (Megaphone):**
  - Verify the `megaphone_id`.
  - **Important:** To validate a Megaphone ID, check the URL `https://traffic.megaphone.fm/{ID}.mp3`. It should return a 200 or 302 Redirect. Checking the ID without the `.mp3` extension often returns a 400 error.
- **Check Transcripts:** Scan the transcript for each segment to ensure it is not truncated (e.g. ends mid-sentence).

Lastly, compile your findings into a Markdown report (e.g. `check_web_report.md`).

This is a multi-step verification task that will require:

- Finding the latest show
- Reviewing its content and segments
- Checking various aspects of the content
- Creating a report
