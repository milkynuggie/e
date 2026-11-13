(() => {
    "use strict";
    if (typeof document === "undefined") return;

    const $ = (id) => document.getElementById(id);
    const boardEl = $("board"),
        padEl = $("pad");

    if (!boardEl || !padEl) return;

    const MAX_MISTAKES = 3,
        MAX_HINTS = 3;

    let solution, given, board, notes, selected, noteMode, mistakes, hints, seconds, timerId, over, history;

    // ---------- Solver / generator ----------
    const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1));
            [a[i], a[j]] = [a[j], a[i]]; } return a; };

    function candidates(g, i) {
        const r = Math.floor(i / 9),
            c = i % 9,
            used = new Set();
        for (let k = 0; k < 9; k++) { used.add(g[r * 9 + k]);
            used.add(g[k * 9 + c]); }
        const br = r - (r % 3),
            bc = c - (c % 3);
        for (let y = 0; y < 3; y++)
            for (let x = 0; x < 3; x++) used.add(g[(br + y) * 9 + bc + x]);
        const out = [];
        for (let n = 1; n <= 9; n++)
            if (!used.has(n)) out.push(n);
        return out;
    }

    // Backtracking with "fewest candidates first"; counts solutions up to `limit`.
    function solve(g, limit, randomize) {
        let best = -1,
            bestC = null;
        for (let i = 0; i < 81; i++) {
            if (g[i] === 0) {
                const c = candidates(g, i);
                if (c.length === 0) return 0;
                if (!bestC || c.length < bestC.length) { best = i;
                    bestC = c; if (c.length === 1) break; }
            }
        }
        if (best === -1) return 1;
        if (randomize) shuffle(bestC);
        let count = 0;
        for (const n of bestC) {
            g[best] = n;
            count += solve(g, limit - count, randomize);
            if (count >= limit) { if (!randomize) g[best] = 0; return count; }
        }
        g[best] = 0;
        return count;
    }

    function generate(clues) {
        const full = Array(81).fill(0);
        solve(full, 1, true); // leaves a complete random grid
        const puzzle = full.slice();
        for (const i of shuffle([...Array(81).keys()])) {
            if (puzzle.filter(Boolean).length <= clues) break;
            const keep = puzzle[i];
            puzzle[i] = 0;
            if (solve(puzzle.slice(), 2, false) !== 1) puzzle[i] = keep; // must stay unique
        }
        return { full, puzzle };
    }

    // ---------- Game state ----------
    function newGame() {
        const difficultyEl = $("difficulty");
        const clues = Number.parseInt(difficultyEl ? difficultyEl.value : "30", 10) || 30;
        const { full, puzzle } = generate(clues);
        solution = full;
        given = puzzle.map(Boolean);
        board = puzzle.slice();
        notes = Array.from({ length: 81 }, () => new Set());
        selected = -1;
        noteMode = false;
        mistakes = 0;
        hints = 0;
        seconds = 0;
        over = false;
        history = [];
        $("notes").textContent = "Notes: off";
        $("notes").classList.remove("active");
        clearInterval(timerId);
        timerId = setInterval(tick, 1000);
        render();
    }

    function tick() {
        seconds++;
        $("timer").textContent = String(Math.floor(seconds / 60)).padStart(2, "0") + ":" + String(seconds % 60).padStart(2, "0");
    }

    function snapshot() { history.push({ board: board.slice(), notes: notes.map((s) => new Set(s)) }); }

    function place(n) {
        if (over || selected < 0 || given[selected]) return;
        if (board[selected] === solution[selected] && board[selected] !== 0) return; // correct cells are locked
        snapshot();
        if (noteMode) {
            if (board[selected]) return;
            notes[selected].has(n) ? notes[selected].delete(n) : notes[selected].add(n);
        } else {
            board[selected] = n;
            notes[selected].clear();
            if (n !== solution[selected]) {
                mistakes++;
                if (mistakes >= MAX_MISTAKES) return finish(false);
            } else {
                clearPeerNotes(selected, n);
            }
        }
        render();
        if (board.every((v, i) => v === solution[i])) finish(true);
    }

    function clearPeerNotes(i, n) {
        const r = Math.floor(i / 9),
            c = i % 9;
        for (let j = 0; j < 81; j++) {
            const jr = Math.floor(j / 9),
                jc = j % 9;
            if (jr === r || jc === c || (Math.floor(jr / 3) === Math.floor(r / 3) && Math.floor(jc / 3) === Math.floor(c / 3))) notes[j].delete(n);
        }
    }

    function erase() {
        if (over || selected < 0 || given[selected] || board[selected] === solution[selected]) return;
        snapshot();
        board[selected] = 0;
        notes[selected].clear();
        render();
    }

    function undo() {
        if (over || !history.length) return;
        const s = history.pop();
        board = s.board;
        notes = s.notes;
        render();
    }

    function hint() {
        if (over || hints >= MAX_HINTS) return;
        let i = selected;
        if (i < 0 || board[i] === solution[i]) {
            const empties = board.map((v, k) => (v !== solution[k] ? k : -1)).filter((k) => k >= 0);
            if (!empties.length) return;
            i = empties[Math.floor(Math.random() * empties.length)];
        }
        snapshot();
        hints++;
        selected = i;
        board[i] = solution[i];
        notes[i].clear();
        clearPeerNotes(i, solution[i]);
        render();
        if (board.every((v, k) => v === solution[k])) finish(true);
    }

    function finish(won) {
        over = true;
        clearInterval(timerId);
        render();
        const endTitle = $("endTitle"),
            endText = $("endText"),
            endModal = $("endModal");

        if (endTitle) endTitle.textContent = won ? "Solved" : "Out of mistakes";
        if (endText) endText.textContent = won ?
            `Finished in ${$("timer").textContent} with ${mistakes} mistake${mistakes === 1 ? "" : "s"}.` :
            "Three wrong entries ends the game. Start a new puzzle to try again.";

        if (typeof bootstrap !== "undefined" && bootstrap.Modal && endModal) {
            bootstrap.Modal.getOrCreateInstance(endModal).show();
        }
    }

    // ---------- Rendering ----------
    function buildBoard() {
        for (let i = 0; i < 81; i++) {
            const d = document.createElement("div");
            d.className = "cell";
            d.tabIndex = -1;
            d.setAttribute("role", "gridcell");
            d.addEventListener("click", () => { selected = i;
                render(); });
            boardEl.appendChild(d);
        }
        for (let n = 1; n <= 9; n++) {
            const b = document.createElement("button");
            b.textContent = n;
            b.dataset.n = n;
            b.addEventListener("click", () => place(n));
            padEl.appendChild(b);
        }
    }

    function render() {
        const sv = selected >= 0 ? board[selected] : 0;
        const sr = Math.floor(selected / 9),
            sc = selected % 9;
        [...boardEl.children].forEach((el, i) => {
            const v = board[i],
                r = Math.floor(i / 9),
                c = i % 9;
            el.className = "cell";
            if (given[i]) el.classList.add("given");
            else if (v) el.classList.add("user");
            if (selected >= 0) {
                const peer = r === sr || c === sc || (Math.floor(r / 3) === Math.floor(sr / 3) && Math.floor(c / 3) === Math.floor(sc / 3));
                if (peer) el.classList.add("peer");
                if (sv && v === sv) el.classList.add("same");
            }
            if (i === selected) el.classList.add("selected");
            if (v && v !== solution[i]) el.classList.add("error");
            if (v) el.textContent = v;
            else if (notes[i].size) {
                el.innerHTML = '<div class="notes">' + [1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => `<span>${notes[i].has(n) ? n : ""}</span>`).join("") + "</div>";
            } else el.textContent = "";
        });
        $("mistakes").textContent = mistakes;
        $("hints").textContent = hints;
        padEl.querySelectorAll("button").forEach((b) => {
            b.classList.toggle("done", board.filter((v, i) => v === +b.dataset.n && v === solution[i]).length === 9);
        });
    }

    // ---------- Events ----------
    $("newGame").addEventListener("click", newGame);
    $("again").addEventListener("click", newGame);
    $("difficulty").addEventListener("change", newGame);
    $("erase").addEventListener("click", erase);
    $("undo").addEventListener("click", undo);
    $("hint").addEventListener("click", hint);
    $("notes").addEventListener("click", () => {
        noteMode = !noteMode;
        $("notes").textContent = "Notes: " + (noteMode ? "on" : "off");
        $("notes").classList.toggle("active", noteMode);
        $("notes").setAttribute("aria-pressed", noteMode);
    });

    document.addEventListener("keydown", (e) => {
        if (e.target.tagName === "SELECT") return;
        if (/^[1-9]$/.test(e.key)) place(+e.key);
        else if (e.key === "Backspace" || e.key === "Delete") erase();
        else if (e.key.toLowerCase() === "n") $("notes").click();
        else if (e.key.startsWith("Arrow")) {
            e.preventDefault();
            if (selected < 0) selected = 40;
            else {
                const d = { ArrowUp: -9, ArrowDown: 9, ArrowLeft: -1, ArrowRight: 1 }[e.key];
                const n = selected + d;
                if (n >= 0 && n < 81 && !(d === -1 && selected % 9 === 0) && !(d === 1 && selected % 9 === 8)) selected = n;
            }
            render();
        }
    });

    buildBoard();
    newGame();
})();