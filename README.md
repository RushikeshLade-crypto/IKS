# IKS Practice

MCQ practice site for **Indian Knowledge System — Section I (Units 1–3)**, FY BTech.
508 questions, each with an explanation and the lecture/notes it comes from.

## Features
- **Practise**: pick All units or one unit, choose topics, 10/20/30/50/all questions, shuffled or topic-by-topic.
- **Practice mode**: answer, then see the correct option and explanation immediately.
- **Mock test mode**: 1 minute per question, change answers freely, full review at the end.
- **Retry my mistakes** and **Saved questions** quick sets.
- **Revise**: every question with answer and explanation, filter by unit/topic, search, hide answers to self-test.
- **Progress**: accuracy and mastery per topic, recent sessions. Stored in the browser (localStorage).
- Keyboard: `1–4` / `A–D` to answer, `Enter` or `→` next, `←` previous, `S` save.
- Light/dark theme, works on phones.

## Files
```
index.html
css/style.css
js/app.js
js/data/unit1.js   # Unit 1 questions
js/data/unit2.js   # Unit 2 questions
js/data/unit3.js   # Unit 3 questions
assets/favicon.svg
vercel.json
```
No build step, no dependencies — plain HTML/CSS/JS.

## Adding or editing questions
Each question looks like this:
```js
{u:1, t:"Vedas", q:"Question text?", o:["Correct answer","Wrong 1","Wrong 2","Wrong 3"], e:"Explanation.", s:"Source"}
```
- **The first option is always the correct one.** The app shuffles options when it shows them.
- `u` = unit number, `t` = topic (new topic names appear automatically).
- Progress is keyed to the question text, so editing a question's wording resets its stats.

## Deploy on Vercel
1. Create a GitHub repo and push these files (the folder contents, so `index.html` is at the repo root).
2. On vercel.com: **Add New → Project → Import** the repo.
3. Framework preset: **Other**. Leave build command and output directory empty. Click **Deploy**.

## Other free hosts
- **GitHub Pages**: repo **Settings → Pages → Deploy from branch → main / root**.
- **Netlify**: drag the folder onto app.netlify.com/drop.
- **Cloudflare Pages**: connect the repo, no build command, output directory `/`.

## Run locally
Open `index.html` directly in a browser, or run `python3 -m http.server` in this folder and visit http://localhost:8000.
