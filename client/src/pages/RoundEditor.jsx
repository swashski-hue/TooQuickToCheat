import { useEffect, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { getRound, createRound, updateRound, uploadImage, fileToDataUrl, SERVER_URL } from "../lib/api.js";
import { computeAnswerLetter } from "../lib/answerLetter.js";
import { QUESTION_TYPES, QUESTION_TYPE_LABELS } from "../lib/questionTypes.js";
import { formatDate } from "../lib/formatDate.js";
import { useCurrentUser } from "../lib/useCurrentUser.js";

const MIN_OPTIONS = 3;
const MAX_OPTIONS = 6;
const MAX_QUESTIONS = 10;

const emptyQuestion = () => ({
  type: "multiple_choice",
  text: "",
  options: ["", "", "", ""],
  correctIndex: 0,
  answerText: "",
  answerNumber: 0,
  timeLimitSeconds: 15,
  pictureUrl: null,
});

export default function RoundEditor() {
  const { id } = useParams();
  const isNew = id === "new";
  const navigate = useNavigate();
  const { user, loading: userLoading } = useCurrentUser();

  const [name, setName] = useState("");
  const [createdBy, setCreatedBy] = useState("");
  const [createdAt, setCreatedAt] = useState(null);
  const [mine, setMine] = useState(true); // true for a brand-new round (you'll own it)
  const [visibility, setVisibility] = useState("public");
  const [questions, setQuestions] = useState([emptyQuestion()]);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploadingIdx, setUploadingIdx] = useState(null);

  useEffect(() => {
    if (!isNew) {
      getRound(id).then((round) => {
        setName(round.name);
        setCreatedBy(round.createdBy || "");
        setCreatedAt(round.createdAt || null);
        setMine(round.mine);
        setVisibility(round.visibility || "public");
        setQuestions(
          round.questions.map((q) => ({
            ...emptyQuestion(),
            ...q,
          }))
        );
        setSelectedIdx(0);
      });
    }
  }, [id, isNew]);

  function updateQuestion(idx, patch) {
    setQuestions((qs) => qs.map((q, i) => (i === idx ? { ...q, ...patch } : q)));
  }

  function updateOption(qIdx, optIdx, value) {
    setQuestions((qs) =>
      qs.map((q, i) =>
        i === qIdx ? { ...q, options: q.options.map((o, j) => (j === optIdx ? value : o)) } : q
      )
    );
  }

  function addOption(qIdx) {
    setQuestions((qs) =>
      qs.map((q, i) => (i === qIdx && q.options.length < MAX_OPTIONS ? { ...q, options: [...q.options, ""] } : q))
    );
  }

  function removeOption(qIdx, optIdx) {
    setQuestions((qs) =>
      qs.map((q, i) => {
        if (i !== qIdx || q.options.length <= MIN_OPTIONS) return q;
        const options = q.options.filter((_, j) => j !== optIdx);
        let correctIndex = q.correctIndex;
        if (optIdx === q.correctIndex) correctIndex = 0;
        else if (optIdx < q.correctIndex) correctIndex -= 1;
        return { ...q, options, correctIndex };
      })
    );
  }

  function moveOption(qIdx, optIdx, direction) {
    setQuestions((qs) =>
      qs.map((q, i) => {
        if (i !== qIdx) return q;
        const target = optIdx + direction;
        if (target < 0 || target >= q.options.length) return q;
        const options = [...q.options];
        [options[optIdx], options[target]] = [options[target], options[optIdx]];
        return { ...q, options };
      })
    );
  }

  function addQuestion() {
    if (questions.length >= MAX_QUESTIONS) return;
    setSelectedIdx(questions.length);
    setQuestions((qs) => [...qs, emptyQuestion()]);
  }

  function removeQuestion(idx) {
    const newLength = questions.length - 1;
    setQuestions((qs) => qs.filter((_, i) => i !== idx));
    setSelectedIdx((i) => {
      if (i === idx) return Math.min(idx, newLength - 1);
      if (i > idx) return i - 1;
      return i;
    });
  }

  function moveQuestion(idx, direction) {
    const target = idx + direction;
    if (target < 0 || target >= questions.length) return;
    setQuestions((qs) => {
      const next = [...qs];
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    });
    setSelectedIdx((i) => (i === idx ? target : i === target ? idx : i));
  }

  async function onPictureChange(idx, fileList) {
    const file = fileList?.[0];
    if (!file) return;
    setError("");
    setUploadingIdx(idx);
    try {
      const dataUrl = await fileToDataUrl(file);
      const { url } = await uploadImage(dataUrl);
      updateQuestion(idx, { pictureUrl: url });
    } catch (e) {
      setError(e.message);
    } finally {
      setUploadingIdx(null);
    }
  }

  async function onSave() {
    setError("");
    if (!name.trim()) return setError("Give the round a name.");
    for (const [i, q] of questions.entries()) {
      if (!q.text.trim()) {
        setSelectedIdx(i);
        return setError(`Question ${i + 1} needs text.`);
      }
      if (q.type === "multiple_choice" || q.type === "sequence") {
        if (q.options.some((o) => !o.trim())) {
          setSelectedIdx(i);
          return setError(`Question ${i + 1}: every option needs text.`);
        }
      } else if (q.type === "normal" && !q.answerText.trim()) {
        setSelectedIdx(i);
        return setError(`Question ${i + 1} needs an answer.`);
      } else if (q.type === "number" && (q.answerNumber === "" || q.answerNumber === null)) {
        setSelectedIdx(i);
        return setError(`Question ${i + 1} needs a numeric answer.`);
      }
    }
    setSaving(true);
    try {
      if (isNew) {
        await createRound({ name, questions, visibility });
      } else {
        await updateRound(id, { name, questions, visibility });
      }
      navigate("/bank");
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  if (userLoading) return null;

  if (!user) {
    return (
      <div className="screen center">
        <h1 className="title">{isNew ? "New Round" : "Edit Round"}</h1>
        <p className="subtitle">Sign in to build rounds.</p>
        <Link className="btn btn-primary" to="/login">
          Sign in
        </Link>
      </div>
    );
  }

  const q = questions[selectedIdx];
  const correctLetter = q.type === "normal" ? computeAnswerLetter(q.answerText) : null;

  return (
    <div className="editor-screen">
      <h1 className="title">{isNew ? "New Round" : "Edit Round"}</h1>
      {error && <p className="error">{error}</p>}

      <div className="editor-meta">
        <label className="field">
          <span>Round name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Opening Round" />
        </label>

        <div className="field">
          <span>Visibility</span>
          {mine ? (
            <div className="type-toggle">
              <button
                className={`btn btn-small ${visibility === "public" ? "btn-primary" : ""}`}
                onClick={() => setVisibility("public")}
              >
                🌐 Public
              </button>
              <button
                className={`btn btn-small ${visibility === "private" ? "btn-primary" : ""}`}
                onClick={() => setVisibility("private")}
              >
                🔒 Private
              </button>
            </div>
          ) : (
            <p className="subtitle">
              {visibility === "private" ? "🔒 Private" : "🌐 Public"} — only the creator can change this.
            </p>
          )}
          <span className="subtitle">
            Created by {isNew ? user.name : createdBy || "Unknown"}
            {createdAt && ` · ${formatDate(createdAt)}`}
          </span>
        </div>
      </div>

      <div className="editor-grid">
        <div className="editor-list-panel">
          <div className="editor-question-list">
            {questions.map((item, idx) => (
              <div className={`editor-question-item ${idx === selectedIdx ? "selected" : ""}`} key={idx}>
                <button className="editor-question-item-main" onClick={() => setSelectedIdx(idx)}>
                  <span className="editor-question-num">{idx + 1}</span>
                  <span className="editor-question-summary">
                    <span className="editor-question-summary-type">{QUESTION_TYPE_LABELS[item.type]}</span>
                    <span className="editor-question-summary-text">{item.text || "Untitled question"}</span>
                  </span>
                </button>
                <div className="editor-question-item-controls">
                  <button className="btn btn-small" onClick={() => moveQuestion(idx, -1)} disabled={idx === 0}>
                    ↑
                  </button>
                  <button
                    className="btn btn-small"
                    onClick={() => moveQuestion(idx, 1)}
                    disabled={idx === questions.length - 1}
                  >
                    ↓
                  </button>
                  {questions.length > 1 && (
                    <button className="btn btn-small btn-danger" onClick={() => removeQuestion(idx)}>
                      ×
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
          <p className="subtitle">
            {questions.length} / {MAX_QUESTIONS} questions
          </p>
          {questions.length < MAX_QUESTIONS && (
            <button className="btn btn-small" onClick={addQuestion}>
              + Add question
            </button>
          )}
        </div>

        <div className="editor-panel">
          <div className="card-title-row">
            <strong>Question {selectedIdx + 1}</strong>
          </div>

          <div className="type-toggle">
            {QUESTION_TYPES.map((t) => (
              <button
                key={t.value}
                className={`btn btn-small ${q.type === t.value ? "btn-primary" : ""}`}
                onClick={() => updateQuestion(selectedIdx, { type: t.value })}
              >
                {t.label}
              </button>
            ))}
          </div>

          <label className="field">
            <span>Question text</span>
            <input
              value={q.text}
              onChange={(e) => updateQuestion(selectedIdx, { text: e.target.value })}
              placeholder="What is...?"
            />
          </label>

          <div className="field">
            <span>Picture (optional)</span>
            {q.pictureUrl ? (
              <div className="picture-preview">
                <img src={`${SERVER_URL}${q.pictureUrl}`} alt="" />
                <button
                  className="btn btn-small btn-danger"
                  onClick={() => updateQuestion(selectedIdx, { pictureUrl: null })}
                >
                  Remove picture
                </button>
              </div>
            ) : (
              <input
                type="file"
                accept="image/png,image/jpeg,image/gif,image/webp"
                onChange={(e) => onPictureChange(selectedIdx, e.target.files)}
                disabled={uploadingIdx === selectedIdx}
              />
            )}
            {uploadingIdx === selectedIdx && <span className="subtitle">Uploading...</span>}
          </div>

          {q.type === "multiple_choice" && (
            <>
              <div className="options-grid">
                {q.options.map((opt, optIdx) => (
                  <label className="field option-field" key={optIdx}>
                    <span>
                      <input
                        type="radio"
                        name={`correct-${selectedIdx}`}
                        checked={q.correctIndex === optIdx}
                        onChange={() => updateQuestion(selectedIdx, { correctIndex: optIdx })}
                      />{" "}
                      Option {optIdx + 1} {q.correctIndex === optIdx && "(correct)"}
                    </span>
                    <div className="option-input-row">
                      <input value={opt} onChange={(e) => updateOption(selectedIdx, optIdx, e.target.value)} />
                      {q.options.length > MIN_OPTIONS && (
                        <button
                          className="btn btn-small btn-danger"
                          onClick={() => removeOption(selectedIdx, optIdx)}
                        >
                          ×
                        </button>
                      )}
                    </div>
                  </label>
                ))}
              </div>
              {q.options.length < MAX_OPTIONS && (
                <button className="btn btn-small" onClick={() => addOption(selectedIdx)}>
                  + Add option
                </button>
              )}
            </>
          )}

          {q.type === "normal" && (
            <label className="field">
              <span>Answer (players press the first letter — "The" is ignored)</span>
              <input
                value={q.answerText}
                onChange={(e) => updateQuestion(selectedIdx, { answerText: e.target.value })}
                placeholder="The Beatles"
              />
              {q.answerText.trim() && (
                <span className="subtitle">
                  Correct board answer: <strong>{correctLetter || "?"}</strong>
                </span>
              )}
            </label>
          )}

          {q.type === "number" && (
            <label className="field">
              <span>Correct answer (number)</span>
              <input
                type="number"
                value={q.answerNumber}
                onChange={(e) => updateQuestion(selectedIdx, { answerNumber: Number(e.target.value) })}
                placeholder="42"
              />
            </label>
          )}

          {q.type === "sequence" && (
            <>
              <p className="subtitle">Enter the items in the correct order — top is first, bottom is last.</p>
              <div className="sequence-list">
                {q.options.map((opt, optIdx) => (
                  <div className="sequence-row" key={optIdx}>
                    <span className="sequence-position">{optIdx + 1}</span>
                    <input value={opt} onChange={(e) => updateOption(selectedIdx, optIdx, e.target.value)} />
                    <div className="sequence-controls">
                      <button
                        className="btn btn-small"
                        onClick={() => moveOption(selectedIdx, optIdx, -1)}
                        disabled={optIdx === 0}
                      >
                        ↑
                      </button>
                      <button
                        className="btn btn-small"
                        onClick={() => moveOption(selectedIdx, optIdx, 1)}
                        disabled={optIdx === q.options.length - 1}
                      >
                        ↓
                      </button>
                      {q.options.length > MIN_OPTIONS && (
                        <button
                          className="btn btn-small btn-danger"
                          onClick={() => removeOption(selectedIdx, optIdx)}
                        >
                          ×
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              {q.options.length < MAX_OPTIONS && (
                <button className="btn btn-small" onClick={() => addOption(selectedIdx)}>
                  + Add item
                </button>
              )}
            </>
          )}

          <label className="field time-field">
            <span>Time limit (seconds)</span>
            <input
              type="number"
              min={5}
              max={120}
              value={q.timeLimitSeconds}
              onChange={(e) => updateQuestion(selectedIdx, { timeLimitSeconds: Number(e.target.value) })}
            />
          </label>
        </div>
      </div>

      <div className="stack">
        <button className="btn btn-primary" onClick={onSave} disabled={saving}>
          {saving ? "Saving..." : "Save round"}
        </button>
        <button className="btn btn-link" onClick={() => navigate("/bank")}>
          Cancel
        </button>
      </div>
    </div>
  );
}
