<div align="center">
  <img src="https://raw.githubusercontent.com/jarredbarber/loe-vibecode/main/themes/loe_original/static/img/logo.png" alt="Living on Earth" width="400">
</div>

This is the website for [Living on Earth](http://loe.org), a weekly environmental news radio program. The site is built with Pelican (a static site generator) and automatically publishes to GitHub Pages.

## 🌍 About Living on Earth

Living on Earth is a weekly, hour-long, award-winning environmental news program distributed by the Public Radio Exchange. Hosted by Steve Curwood, the program features interviews and commentary on environmental issues. The show has been broadcasting since 1991 and airs on over 300 public radio stations nationwide.

# 🚀 Quick Start for Content Editors

### Viewing the Live Site

The site is published at: **<http://vibingon.earth>**

This guide is for the Living on Earth team. It explains how to add the weekly show and its segments to the website using GitHub.

## 1. Quick Start & Staging

**Everything you save here goes to the "Staging" site first.**

1. **Go to GitHub**: Navigate to the `content/shows/[year]` folder (e.g., `content/shows/2025`).
2. **Create a Folder**: Click **Add file > Create new file**. Name it `MM-DD/show.md` (example: `12-19/show.md`).
3. **Copy Template**: Paste the "Show Template" below into the file.
4. **Save (Commit)**: When you click **Commit changes**, the Staging site automatically rebuilds.
5. **Preview**: Check your work on the Staging URL (ask your web lead for the link) before it goes Live.

---

## 2. The Show File (`show.md`)

This is the cover page for the episode.

### Template

```yaml
---
title: Living on Earth: December 19, 2025
date: 2025-12-19
category: Shows
template: show
megaphone_id: LOE1234567890
image_url: https://loe.org/images/content/2025-12-19/cover.jpg
summary: The full description of the show goes here.
---

## Segments

### [First Segment Title]({filename}segment-slug.md)

### [Second Segment Title]({filename}another-segment.md)
```

### Key Fields (Frontmatter)

| Field | Description | Example |
| :--- | :--- | :--- |
| **title** | The main headline. | `Living on Earth: December 19, 2025` |
| **date** | Publish date (Year-Month-Day). | `2025-12-19` |
| **megaphone_id** | The ID from the Megaphone platform. | `LOE1234567890` |
| **summary** | Short paragraph for the homepage. | `A look at the UN Climate Summit...` |

> **Important**: You must manually list the segments at the bottom using the exact format shown above.

---

## 3. The Segment Files

Each story gets its own file in the same folder. Name them descriptively, using dashes (e.g., `climate-summit.md`).

### Template

```yaml
---
title: Climate Summit Reaches Agreement
date: 2025-12-19
category: Segments
megaphone_id: LOE0987654321
image_url: https://loe.org/images/content/2025-12-19/summit.jpg
image_caption: Description of the image. (Photo: UN Photo)
summary: A short summary of this specific segment.
---

## Transcript

HOST: Welcome back to Living on Earth.

GUEST: It's great to be here.

<!-- Example of how to add an image in the body text -->
![A wind turbine in a field](https://loe.org/images/content/2025-12-19/wind-turbine.jpg)

<!-- Example of a link -->
For more information, visit the [UN Climate Change website](https://unfccc.int).
```

---

## 4. Markdown cheat sheet

* **Bold**: `**text**` → **text**
* **Italics**: `*text*` → *text*
* **Links**: `[Link Text](https://google.com)`
* **Images**: `![Alt Text](ImageURL)`
* **Headers**: `# Title` (Big), `## Section` (Medium), `### Sub-section` (Small)

> **Advanced (HTML)**: You can also use standard HTML codes in these files. This is useful for **embedding videos** (like YouTube) or creating special layouts. Just paste the "Embed Code" (usually an `<iframe>` tag) directly into the text where you want it to appear.

---

## 5. Saving (Committing)

When you are done editing:

1. Scroll to the bottom of the page.
2. Write a message like "Add show for Dec 19".
3. Click the green **Commit changes** button.

---

## 6. How This Website Works (Behind the Scenes)

You might wonder where the "Save" button is or why there isn't a normal CMS like WordPress.

This is a **Static Site**.

1. **Files vs. Database**: Instead of storing stories in a hidden database, every show and segment is a simple text file (`.md`) that you can see and touch.
2. **The "Build" Process**: When you "Commit" (save) a file on GitHub, a robot wakes up. It reads all these text files and uses them to build the actual HTML webpages you see in your browser.
3. **Speed & Security**: Because the final website is just simple pages (not a complex program running every time someone clicks a link), it is incredibly fast, very secure, and almost impossible to crash.

## 📖 Additional Resources

### Markdown Guide

* [Markdown Cheatsheet](https://www.markdownguide.org/cheat-sheet/)
* Use `#` for headers, `**bold**`, `*italic*`
* Links: `[text](url)`
* Images: `![alt text](url)`

### Pelican Documentation

* [Pelican Docs](https://docs.getpelican.com/)
* [Writing Content](https://docs.getpelican.com/en/stable/content.html)
* [Theming](https://docs.getpelican.com/en/stable/themes.html)

### GitHub Pages

* [GitHub Pages Docs](https://docs.github.com/en/pages)
* [Custom Domains](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site)

## 🤝 Getting Help

* Check the "Actions" tab for build errors
* Review this README for common tasks
* Look at existing content files as examples
* Test changes locally before committing

## 📄 License

This project is for migrating Living on Earth content. Refer to Living on Earth's licensing for content usage.
