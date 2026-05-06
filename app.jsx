/* App — 小玩的心靈牌卡占卜
 * Flow: 選牌陣 → 填問題 → 抽牌 → 結果
 * 牌片橫式 (約 1.41:1)
 */
const { useState, useEffect, useRef, useMemo } = React;

/* ---------------- Spread definitions ---------------- */
/* layout grid: 14 cols × N rows. each slot has {col, row, label} (row/col 1-indexed) */

const SPREADS = {
  one: { label: "單題占卜", en: "SINGLE QUESTION", blurb: "萬用牌陣，整體訊息與發展方向" },
  choice: { label: "選擇牌陣", en: "CHOICE", blurb: "兩個（或多個）選項猶豫不決時用" },
  love: { label: "感情牌陣", en: "LOVE", blurb: "兩人關係現況與未來發展" },
  work: { label: "事業牌陣", en: "CAREER", blurb: "事業的現況與未來發展" }
};

const WORK_TYPES = ["給人家請（受僱）", "自己做主（接案 / 自由）", "自己創業 / 開店"];
const LOVE_STATES = ["曖昧", "分手", "藕斷絲連", "斷聯", "復合", "交往中", "婚姻中", "地下情", "開放式關係"];

/* Real spread layouts — return { width, slots:[{x,y,labelGroup}], groups:[{title, labelX, labelY, labelW}] }
 * coordinates in a 1000-wide × variable-height grid (we then scale via CSS).
 * card slot rendered as 160×113 area (3:2 closer to 1.41:1) — we use CARD_W / CARD_H constants.
 */

// Reveal layout: every spread is a uniform 3-per-row grid. Each row has a label.
const CARD_W = 310;
const CARD_H = 219; // landscape ~1.41:1
const GAP_X = 18;
const LABEL_H = 44;
const ROW_GAP = 14;

function buildLayout(spreadKey, branchCount, oneCount) {
  // Compose rows of titles, then place 3 cards per row.
  let rowTitles;
  let hideFirstLabel = false;
  if (spreadKey === "one") {
    const n = Math.max(1, Math.min(48, oneCount || 3));
    const rows = Math.ceil(n / 3);
    rowTitles = new Array(rows).fill("");
    hideFirstLabel = true;
  } else if (spreadKey === "work") {
    rowTitles = [
    "你對這份工作的想法與行動",
    "工作上所遇到的盲點／問題",
    "這份工作擁有的人際、資源狀態",
    "未來工作三個月的發展"];

  } else if (spreadKey === "love") {
    rowTitles = [
    "兩人現在的感情狀態",
    "你對這段關係的想法與行動",
    "對方對這段關係的想法與行動",
    "兩人未來三個月的發展"];

  } else if (spreadKey === "choice") {
    const N = Math.max(2, Math.min(4, branchCount || 2));
    const labels = ["A", "B", "C", "D"];
    rowTitles = ["現在的狀態"];
    for (let i = 0; i < N; i++) rowTitles.push(`選 ${labels[i]} 的發展`);
  } else {
    rowTitles = [];
  }

  const w = 3 * CARD_W + 2 * GAP_X;
  const rowH = LABEL_H + CARD_H;
  const groups = [];
  const slots = [];
  rowTitles.forEach((title, ri) => {
    const useLabel = !hideFirstLabel;
    const labelH = useLabel ? LABEL_H : 0;
    const y = ri === 0 ? 0 : groups[ri - 1].y + groups[ri - 1].labelH + CARD_H + ROW_GAP;
    groups.push({ title, x: 0, y, w, labelH });
    for (let c = 0; c < 3; c++) {
      slots.push({
        x: c * (CARD_W + GAP_X),
        y: y + labelH,
        group: ri
      });
    }
  });
  // For "one" spread, trim slots to exact count (last row may have <3)
  if (spreadKey === "one") {
    const n = Math.max(1, Math.min(48, oneCount || 3));
    slots.length = n;
  }
  const last = groups[groups.length - 1];
  const h = last.y + last.labelH + CARD_H;
  return { w, h, groups, slots };
}

/* ---------------- Helpers ---------------- */

function shuffle(a) {
  const arr = a.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function getCardCount(spreadKey, branchCount, oneCount) {
  if (spreadKey === "one") return Math.max(1, Math.min(48, oneCount || 3));
  if (spreadKey === "work" || spreadKey === "love") return 12;
  if (spreadKey === "choice") return 3 + 3 * Math.max(2, Math.min(4, branchCount || 2));
  return 0;
}

/* ---------------- Tweaks ---------------- */

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "accent": "#e8a04a"
} /*EDITMODE-END*/;

/* ---------------- App ---------------- */

function App() {
  const [tweaks, setTweak] = useTweaks(TWEAK_DEFAULTS);
  React.useEffect(() => {
    document.documentElement.style.setProperty("--accent", tweaks.accent);
  }, [tweaks.accent]);

  // step: home -> spread -> question -> shuffle -> pick -> reveal
  const [step, setStep] = useState("home");
  const [spreadKey, setSpreadKey] = useState("one");
  const [branchCount, setBranchCount] = useState(2); // for choice spread
  const [topic, setTopic] = useState("");
  const [luckyNumber, setLuckyNumber] = useState("");
  const [branches, setBranches] = useState(["", ""]); // for choice
  const [name, setName] = useState("");
  const [partnerName, setPartnerName] = useState("");
  const [workType, setWorkType] = useState(WORK_TYPES[0]);
  const [loveState, setLoveState] = useState(LOVE_STATES[0]);
  const [oneCount, setOneCount] = useState(3);

  const [deck, setDeck] = useState([]);
  const [pickedIds, setPickedIds] = useState([]);

  const need = getCardCount(spreadKey, branchCount);
  const layout = useMemo(() => buildLayout(spreadKey, branchCount), [spreadKey, branchCount]);

  function gotoSpread() {
    setStep("spread");
    setTimeout(() => document.getElementById("flow")?.scrollIntoView({ behavior: "smooth", block: "start" }), 60);
  }

  function gotoQuestion() {
    if (spreadKey === "choice") {
      setBranches(Array(branchCount).fill("").map((_, i) => branches[i] || ""));
    }
    setStep("question");
  }

  function startShuffle() {
    if (!name.trim()) {
      flashTextarea("name");
      return;
    }
    if (spreadKey === "love" && !partnerName.trim()) {
      flashTextarea("partner-name");
      return;
    }
    if (!topic.trim()) {
      flashTextarea("topic");
      return;
    }
    if (!luckyNumber || !luckyNumber.toString().trim()) {
      flashTextarea("lucky-number");
      return;
    }
    if (spreadKey === "choice") {
      const filled = branches.slice(0, branchCount).every((b) => b.trim());
      if (!filled) {
        flashTextarea("branch-0");
        return;
      }
    }
    setDeck(shuffle(window.CARDS));
    setPickedIds([]);
    setStep("shuffle");
    setTimeout(() => setStep("pick"), 2400);
  }

  function pickCard(card) {
    if (pickedIds.includes(card.id)) return;
    if (pickedIds.length >= need) return;
    setPickedIds((prev) => [...prev, card.id]);
  }

  useEffect(() => {
    if (step === "pick" && pickedIds.length === need) {
      setTimeout(() => setStep("reveal"), 600);
    }
  }, [pickedIds, step, need]);

  function reset() {
    setStep("spread");
    setPickedIds([]);
    setDeck([]);
  }

  function flashTextarea(id) {
    const el = document.getElementById(id);
    if (el) {
      el.style.borderColor = "var(--accent)";
      el.style.boxShadow = "0 0 0 4px rgba(232,160,74,.18)";
      setTimeout(() => {el.style.borderColor = "";el.style.boxShadow = "";}, 1500);
      el.focus();
    }
  }

  const showHome = step === "home";

  return (
    <div className="app">
      <Nav onStart={gotoSpread} onHome={() => {setStep("home");window.scrollTo({ top: 0, behavior: "smooth" });}} />

      {showHome && <Hero onStart={gotoSpread} />}

      <section className={`flow ${showHome ? "" : "flow-active"}`} id="flow">
        <Steps step={step} />

        {step === "spread" &&
        <SpreadStage
          spreadKey={spreadKey}
          setSpreadKey={setSpreadKey}
          onNext={gotoQuestion} />

        }

        {step === "question" &&
        <QuestionStage
          spreadKey={spreadKey}
          topic={topic} setTopic={setTopic}
          luckyNumber={luckyNumber} setLuckyNumber={setLuckyNumber}
          branches={branches} setBranches={setBranches}
          branchCount={branchCount} setBranchCount={setBranchCount}
          name={name} setName={setName}
          partnerName={partnerName} setPartnerName={setPartnerName}
          workType={workType} setWorkType={setWorkType}
          loveState={loveState} setLoveState={setLoveState}
          oneCount={oneCount} setOneCount={setOneCount}
          onBack={() => setStep("spread")}
          onNext={startShuffle} />

        }

        {step === "shuffle" && <ShuffleStage />}

        {step === "pick" &&
        <PickStage
          deck={deck}
          need={need}
          pickedIds={pickedIds}
          onPick={pickCard} />

        }

        {step === "reveal" &&
        <RevealStage
          spreadKey={spreadKey}
          layout={layout}
          cards={pickedIds.map((id) => window.CARDS.find((c) => c.id === id))}
          topic={topic}
          luckyNumber={luckyNumber}
          branches={branches.slice(0, branchCount)}
          name={name}
          partnerName={partnerName}
          workType={workType}
          loveState={loveState}
          onReset={reset} />

        }
      </section>

      {showHome && <Footer />}

      <TweaksPanel title="Tweaks">
        <TweakSection title="外觀">
          <TweakColor label="主色"
          value={tweaks.accent}
          options={["#e8a04a", "#c97a4a", "#8aa872", "#7d8fae", "#b08bb0"]}
          onChange={(v) => setTweak("accent", v)} />
        </TweakSection>
      </TweaksPanel>
    </div>);

}

/* ---------------- Nav / Hero / Footer ---------------- */

function Nav({ showLogo = true, onStart, onHome }) {
  return (
    <nav className="nav">
      <div className="brand" onClick={onHome} style={{ cursor: onHome ? "pointer" : "default" }}>
        {showLogo && <img src="logo.png" alt="" className="brand-logo" />}
        <span className="brand-name" style={{ fontFamily: "\"Noto Serif TC\"", fontWeight: "600", fontSize: "15px", color: "rgb(145, 115, 55)" }}>我只是想知道 ✦ 心靈牌卡<em></em></span>
      </div>
      <div className="nav-links">
        <a href="#top" onClick={(e) => {e.preventDefault();if (onStart) onStart();else window.scrollTo({ top: 0, behavior: "smooth" });}}>開始抽牌</a>
        <a href="https://whoyouare-divination.vercel.app/#services" target="_blank" rel="noreferrer">占卜方案</a>
        <a href="https://www.instagram.com/whoyouare_divination/" target="_blank" rel="noreferrer" className="nav-ig">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="5" ry="5"></rect>
            <circle cx="12" cy="12" r="4"></circle>
            <circle cx="17.5" cy="6.5" r="0.6" fill="currentColor"></circle>
          </svg>
          我只是想知道
        </a>
        <a href="https://www.instagram.com/yufangzhong/" target="_blank" rel="noreferrer" className="nav-ig">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="5" ry="5"></rect>
            <circle cx="12" cy="12" r="4"></circle>
            <circle cx="17.5" cy="6.5" r="0.6" fill="currentColor"></circle>
          </svg>
          小玩
        </a>
      </div>
    </nav>);

}

function Hero({ onStart }) {
  return (
    <section className="hero">
      <div className="hero-orb">
        <img src="logo.png" alt="我只是想知道" style={{ objectFit: "contain", width: "480px", height: "480px" }} />
      </div>
      <h1 className="hero-title" style={{ fontSize: "25px" }}>
        我只是想知道<span className="hero-x"> × </span>線上抽牌
      </h1>
      <p className="lede">
        我們來到「占卜」面前，尋找的，<br />
        不過是那份 <em>「知道」</em>。
      </p>
      <div className="hero-cta">
        <button className="btn" onClick={onStart}>開始抽牌</button>
        <a className="btn ghost" href="https://whoyouare-divination.vercel.app/#services" target="_blank" rel="noreferrer">占卜方案</a>
      </div>
    </section>);

}

function Footer() {
  return (
    <div className="footer">
      ✦ 小玩的心靈牌卡占卜 · 占卜時效三個月 · 帶著聊天的心情來
    </div>);

}

/* ---------------- Steps indicator ---------------- */

function Steps({ step }) {
  const order = ["spread", "question", "shuffle", "pick", "reveal"];
  const labels = {
    spread: "01 選牌陣",
    question: "02 提問",
    shuffle: "03 洗牌",
    pick: "04 抽牌",
    reveal: "05 結果"
  };
  const active = order.indexOf(step);
  if (step === "home") return null;
  return (
    <div className="steps">
      {order.map((k, i) =>
      <span key={k} className={i === active ? "on" : i < active ? "done" : ""}>
          {labels[k]}
        </span>
      )}
    </div>);

}

/* ---------------- Step 1: 選牌陣 ---------------- */

function SpreadStage({ spreadKey, setSpreadKey, onNext }) {
  return (
    <div className="stage stage-spread">
      <h2 className="stage-title" style={{ marginBottom: "32px" }}>選擇你的<span className="accent">牌陣</span></h2>

      <div className="spread-grid">
        {Object.entries(SPREADS).map(([key, s]) =>
        <button key={key}
        className={`spread-card ${spreadKey === key ? "on" : ""}`}
        onClick={() => setSpreadKey(key)}>
            <div className="spread-en">{s.en}</div>
            <div className="spread-label">{s.label}</div>
            <div className="spread-blurb">{s.blurb}</div>
          </button>
        )}
      </div>

      <button className="btn lg" onClick={onNext}>下一步 · 填問題 →</button>
    </div>);

}

/* ---------------- Step 2: 填問題 ---------------- */

function QuestionStage({ spreadKey, topic, setTopic, luckyNumber, setLuckyNumber, branches, setBranches,
  branchCount, setBranchCount, name, setName,
  partnerName, setPartnerName,
  workType, setWorkType, loveState, setLoveState,
  oneCount, setOneCount,
  onBack, onNext }) {
  const isChoice = spreadKey === "choice";
  const isLove = spreadKey === "love";
  const isWork = spreadKey === "work";
  const isOne = spreadKey === "one";
  const totalCards = getCardCount(spreadKey, branchCount, oneCount);

  function setBranch(i, v) {
    const next = branches.slice();
    while (next.length < branchCount) next.push("");
    next[i] = v;
    setBranches(next);
  }

  function addBranch() {
    if (branchCount >= 4) return;
    setBranchCount(branchCount + 1);
    if (branches.length < branchCount + 1) {
      setBranches([...branches, ""]);
    }
  }
  function removeBranch(i) {
    if (branchCount <= 2) return;
    const next = branches.slice();
    next.splice(i, 1);
    setBranches(next);
    setBranchCount(branchCount - 1);
  }

  const labels = ["A", "B", "C", "D"];

  return (
    <div className="stage stage-question">
      <h2 className="stage-title">你想<span className="accent">知道的是...</span></h2>
      <p className="stage-sub">{SPREADS[spreadKey].label} · 共 {totalCards} 張牌</p>

      <div className="q-form">
        {isOne ?
        <div className="q-row">
            <div className="q-col">
              <label className="q-label">你的暱稱 <span className="required">✦</span></label>
              <input id="name" className="q-input" value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="例：小玩" required />
            </div>
            <div className="q-col q-col-narrow">
              <label className="q-label">抽幾張牌 <span className="optional">(3–48)</span></label>
              <input type="number" min="3" max="48"
            className="q-input one-count-input"
            value={oneCount}
            onChange={(e) => {
              const v = parseInt(e.target.value, 10);
              if (!isNaN(v)) setOneCount(Math.max(3, Math.min(48, v)));else
              setOneCount("");
            }} />
            </div>
            <div className="q-col q-col-narrow">
              <label className="q-label">心中想一個數字 <span className="required">✦</span> <span className="optional">(01–99)</span></label>
              <input type="number" min="1" max="99" id="lucky-number"
            className="q-input one-count-input"
            value={luckyNumber}
            onChange={(e) => {
              const v = e.target.value;
              if (v === "") {setLuckyNumber("");return;}
              const n = parseInt(v, 10);
              if (!isNaN(n)) setLuckyNumber(String(Math.max(1, Math.min(99, n))));
            }}
            placeholder="07" />
            </div>
          </div> :

        <div className="q-row">
            <div className="q-col">
              <label className="q-label">你的暱稱 <span className="required">✦</span></label>
              <input id="name" className="q-input" value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="例：小玩" required />
            </div>
            <div className="q-col q-col-narrow">
              <label className="q-label">心中想一個數字 <span className="required">✦</span> <span className="optional">(01–99)</span></label>
              <input type="number" min="1" max="99" id="lucky-number"
            className="q-input one-count-input"
            value={luckyNumber}
            onChange={(e) => {
              const v = e.target.value;
              if (v === "") {setLuckyNumber("");return;}
              const n = parseInt(v, 10);
              if (!isNaN(n)) setLuckyNumber(String(Math.max(1, Math.min(99, n))));
            }}
            placeholder="07" />
            </div>
          </div>
        }

        {isLove &&
        <React.Fragment>
            <label className="q-label">對方的暱稱 <span className="required">✦</span></label>
            <input id="partner-name" className="q-input" value={partnerName}
          onChange={(e) => setPartnerName(e.target.value)}
          placeholder="例：A 先生" required />

            <label className="q-label">與對方的感情狀態</label>
            <div className="chip-rows">
              <div className="chip-row">
                {["曖昧", "分手", "斷聯", "復合", "藕斷絲連"].map((s) =>
              <button key={s} type="button"
              className={`chip ${loveState === s ? "on" : ""}`}
              onClick={() => setLoveState(s)}>{s}</button>
              )}
              </div>
              <div className="chip-row">
                {["交往中", "婚姻中", "地下情", "開放式關係"].map((s) =>
              <button key={s} type="button"
              className={`chip ${loveState === s ? "on" : ""}`}
              onClick={() => setLoveState(s)}>{s}</button>
              )}
              </div>
            </div>
          </React.Fragment>
        }



        {isWork &&
        <React.Fragment>
            <label className="q-label">工作類型</label>
            <div className="chip-row">
              {WORK_TYPES.map((s) =>
            <button key={s} type="button"
            className={`chip ${workType === s ? "on" : ""}`}
            onClick={() => setWorkType(s)}>{s}</button>
            )}
            </div>
          </React.Fragment>
        }

        <label className="q-label">想問的事 ✦</label>
        <textarea id="topic" className="q-input" rows={3}
        value={topic} onChange={(e) => setTopic(e.target.value)}
        placeholder={
        isChoice ?
        "例：我目前在 A 和 B 之間猶豫該選哪個" :
        "例：這三個月的感情發展如何？"
        } />
        <div className="q-hint">
          建議用開放式問法（How / What / Why） · 不能問：生死 / 官司 / 健康 / 投資
        </div>
        <div className="q-warn">
          ⚠ 為了保持占卜的客觀性，只需告知問題即可，不需分享事件現況或個人想法，避免干擾牌面解讀，特殊情況可額外補充（無須提太多細節）。
        </div>

        {isChoice &&
        <div className="branches">
            <div className="branches-head">
              <span>你的選項</span>
              <span className="branches-meta" style={{ color: "rgb(232, 160, 74)" }}>{branchCount} 選 1 · 最多 4 選 1</span>
            </div>
            {Array.from({ length: branchCount }).map((_, i) =>
          <div key={i} className="branch-row">
                <span className="branch-tag" style={{ backgroundColor: "rgb(245, 201, 0)" }}>選 {labels[i]}</span>
                <input
              id={`branch-${i}`}
              className="q-input"
              value={branches[i] || ""}
              onChange={(e) => setBranch(i, e.target.value)}
              placeholder={`例：${i === 0 ? "留在現職" : i === 1 ? "去新公司" : "其他選項"}`} />
            
                {branchCount > 2 && i >= 2 &&
            <button className="branch-x" onClick={() => removeBranch(i)} title="移除">×</button>
            }
              </div>
          )}
            {branchCount < 4 &&
          <button className="branch-add" onClick={addBranch}>
                ＋ 加一個選項（每多一組 +3 張牌）
              </button>
          }
          </div>
        }
      </div>

      <div className="stage-actions">
        <button className="btn ghost" onClick={onBack}>← 返回</button>
        <button className="btn lg" onClick={onNext}>準備好了，開始洗牌 →</button>
      </div>
    </div>);

}

/* ---------------- Step 3: 洗牌 ---------------- */

function ShuffleStage() {
  return (
    <div className="stage stage-shuffle">
      <div className="shuffle-deck">
        {[0, 1, 2, 3, 4, 5, 6].map((i) =>
        <div key={i} className="shuf-card"
        style={{
          "--r": `${Math.sin(i) * 8}deg`,
          "--d": `${i * 0.1}s`
        }}
        dangerouslySetInnerHTML={{ __html: window.CardArt.cardBack(i) }} />
        )}
      </div>
      <div className="shuffle-msg">洗牌中 ✦ 請默念心中的問題⋯⋯</div>
    </div>);

}

/* ---------------- Step 4: 抽牌（扇形） ---------------- */

function PickStage({ deck, need, pickedIds, onPick }) {
  const total = deck.length; // all 48
  const cards = deck;
  const remaining = need - pickedIds.length;

  return (
    <div className="stage stage-pick">
      <div className="pick-instructions">
        <p>從 {total} 張牌中，憑直覺選 <strong>{need}</strong> 張。</p>
        <div className="pick-count">已選 {pickedIds.length} / {need} · 還需要 {remaining} 張</div>
      </div>

      <div className="fan-stage">
        {cards.map((card, i) => {
          const center = (total - 1) / 2;
          const offset = i - center;
          const angle = offset * 1.0;
          const x = offset * 11;
          const y = Math.abs(offset) * 0.3;
          const isPicked = pickedIds.includes(card.id);
          return (
            <div key={card.id}
            className={`fan-card fan-card-h ${isPicked ? "picked" : ""}`}
            style={{
              transform: `translate(${x}px, ${y}px) rotate(${angle}deg) ${isPicked ? "translateY(-30px)" : ""}`,
              zIndex: 50 + i
            }}
            onClick={() => onPick(card)}
            dangerouslySetInnerHTML={{ __html: window.CardArt.cardBack(card.id) }} />);


        })}
      </div>

      <div className="pick-tip">點一下牌就會抽出</div>
    </div>);

}

/* ---------------- Step 5: 結果 ---------------- */

function RevealStage({ spreadKey, layout, cards, topic, luckyNumber, branches, name, partnerName, workType, loveState, onReset }) {
  const [flipped, setFlipped] = useState({});
  const [downloading, setDownloading] = useState(false);
  const [zoomCard, setZoomCard] = useState(null);
  const sheetRef = useRef(null);

  // Auto-flip with stagger after a short delay
  useEffect(() => {
    cards.forEach((c, i) => {
      setTimeout(() => {
        setFlipped((prev) => ({ ...prev, [c.id]: true }));
      }, 300 + i * 220);
    });
  }, []);

  const allFlipped = cards.every((c) => flipped[c.id]);

  function flipAll() {
    const next = {};
    cards.forEach((c) => next[c.id] = true);
    setFlipped(next);
  }

  async function downloadImage() {
    if (!window.html2canvas) {
      alert("正在載入截圖工具，請稍候再試。");
      return;
    }
    setDownloading(true);
    try {
      // ensure all flipped first
      flipAll();
      await new Promise((r) => setTimeout(r, 1100)); // wait for flip animation

      const node = sheetRef.current;
      const canvas = await window.html2canvas(node, {
        backgroundColor: "#fffaf0",
        scale: 2,
        useCORS: true,
        logging: false
      });
      const url = canvas.toDataURL("image/jpeg", 0.92);
      const link = document.createElement("a");
      const ts = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
      link.download = `whoyouare-${SPREADS[spreadKey].en.toLowerCase().replace(/\s/g, "")}-${ts}.jpg`;
      link.href = url;
      link.click();
    } catch (e) {
      console.error(e);
      alert("截圖失敗，請改用手機/電腦自帶的截圖功能。");
    } finally {
      setDownloading(false);
    }
  }

  const labelDisplay = useMemo(() => {
    if (spreadKey === "choice") {
      const tags = ["A", "B", "C", "D"];
      return layout.groups.map((g, i) => {
        if (i === 0) return g.title;
        const branchText = branches[i - 1];
        if (branchText) return `選 ${tags[i - 1]}：${branchText}`;
        return g.title;
      });
    }
    return layout.groups.map((g) => g.title);
  }, [spreadKey, layout, branches]);

  return (
    <div className="stage stage-reveal">
      <div className="reveal-header">
        <h2 className="stage-title">你的<span className="accent">抽牌結果</span></h2>
      </div>

      <div className="reveal-sheet" ref={sheetRef} style={{ backgroundColor: "rgba(255, 251, 240, 0.8)" }}>
        <div className="sheet-header">
          <div className="sheet-meta-row" style={{ fontSize: "15px" }}>
            <div className="meta-cell"><span className="sheet-meta-k">暱稱</span> {name || "—"}{spreadKey === "love" && partnerName ? ` ＆ ${partnerName}` : ""}</div>
            {luckyNumber && <div className="meta-cell"><span className="sheet-meta-k">數字</span> {String(luckyNumber).padStart(2, "0")}</div>}
            <div className="meta-cell"><span className="sheet-meta-k">牌陣</span> {SPREADS[spreadKey].label}{spreadKey === "work" ? ` · ${workType}` : ""}{spreadKey === "love" ? ` · ${loveState}` : ""}</div>
            <div className="meta-cell"><span className="sheet-meta-k">日期</span> {new Date().toLocaleDateString("zh-TW")}</div>
          </div>
          <div className="sheet-brand">
            <img src="logo.png" alt="" />
            <div>
              <div className="sheet-brand-name">小玩的心靈牌卡占卜</div>
              <div className="sheet-brand-en">whoyouare divination</div>
            </div>
          </div>
        </div>

        {topic &&
        <div className="sheet-question">
            <span className="sheet-question-k">想問的事</span>
            <span className="sheet-question-v">{topic}</span>
          </div>
        }

        <div className="sheet-board" style={{ width: layout.w, height: layout.h }}>
          {layout.groups.map((g, gi) =>
          g.title ?
          <div key={gi} className="board-label"
          style={{ left: g.x, top: g.y, width: g.w }}>
                <span className="board-label-num">{String(gi + 1).padStart(2, "0")}</span>
                <span className="board-label-text">{labelDisplay[gi]}</span>
              </div> :
          null
          )}

          {layout.slots.map((slot, i) => {
            const card = cards[i];
            if (!card) return null;
            const isFlipped = flipped[card.id];
            return (
              <div key={i}
              className={`board-card ${isFlipped ? "flipped" : ""}`}
              style={{
                left: slot.x, top: slot.y,
                width: CARD_W, height: CARD_H
              }}
              onClick={() => {
                if (!isFlipped) {
                  setFlipped((prev) => ({ ...prev, [card.id]: true }));
                } else {
                  setZoomCard(card);
                }
              }}>
                
                <div className="board-card-flipper">
                  <div className="board-card-face board-card-back"
                  dangerouslySetInnerHTML={{ __html: window.CardArt.cardBack(card.id) }} />
                  <div className="board-card-face board-card-front">
                    <img src={card.src} alt={`card ${card.num}`} />
                  </div>
                </div>
              </div>);

          })}
        </div>

        {zoomCard &&
        <div className="zoom-overlay" onClick={() => setZoomCard(null)}>
            <div className="zoom-frame" onClick={(e) => e.stopPropagation()}>
              <button className="zoom-close" onClick={() => setZoomCard(null)}>×</button>
              <img src={zoomCard.src} alt={`card ${zoomCard.num}`} />
              <div className="zoom-cap">牌 #{String(zoomCard.num).padStart(2, "0")} · 點擊背景關閉</div>
            </div>
          </div>
        }

        <div className="sheet-foot">
          ✦ 請保留此抽牌結果 ✦
        </div>
      </div>

      <div className="reveal-actions">
        {!allFlipped && <button className="btn ghost" onClick={flipAll}>一次全部翻開</button>}
        <button className="btn lg" onClick={downloadImage} disabled={downloading}>
          {downloading ? "產生圖片中⋯" : "儲存結果"}
        </button>
        <a className="btn ghost" href="https://www.instagram.com/yufangzhong/" target="_blank" rel="noreferrer">
          傳給小玩
        </a>
        <button className="btn cream" onClick={onReset}>↻ 重新抽牌</button>
      </div>

      <div className="reveal-tip">
        ⓘ 抽完之後，請<strong>下載這張圖</strong>傳給小玩，小玩會在 {spreadKey === "one" ? "3–5" : "5–7"} 天內把完整解析回給你
      </div>
    </div>);

}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
