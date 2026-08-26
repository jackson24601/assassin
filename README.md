# Class Review

A web-based classroom review game. Teachers build the quiz, then share a unique player page so teams can join.

## What you can do

- Select **2–8 teams**
- Add **multiple-choice** and **true/false** questions, marking the correct answer
- Click **Create Game** to generate a **unique player URL** you can share
- After everyone has joined, click **Start Game** in the lobby; questions appear one at a time in random order
- Right answers score **+1**, wrong answers score **-1**
- Share that page address with the class; each team opens it and joins
- See who has joined from the teacher lobby

Work on the quiz is saved in the browser. The live join link is created when you click Create Game.

## Run it locally

```bash
npm start
```

Then visit [http://127.0.0.1:4173](http://127.0.0.1:4173). Create Game needs that address — a Live Server preview or opening `index.html` directly cannot create the student URL unless this server is also running.

If students are on phones, open the teacher page using your computer's local network address (not `localhost`) so the shared player link works on their devices.

## Tests

```bash
npm test
```
