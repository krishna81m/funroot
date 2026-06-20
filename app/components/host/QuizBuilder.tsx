'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

type QuestionType = 'quiz' | 'truefalse' | 'typeAnswer' | 'slider' | 'puzzle' | 'poll' | 'wordcloud' | 'brainstorm' | 'openended' | 'SLIDE'

const SCORED_TYPES: QuestionType[] = ['quiz', 'truefalse', 'typeAnswer', 'slider', 'puzzle']
const UNSCORED_TYPES: QuestionType[] = ['poll', 'wordcloud', 'brainstorm', 'openended']

function emptyItem(type: QuestionType, orderIndex: number): any {
  const base = { id: `item-${Date.now()}-${orderIndex}`, orderIndex, type, mediaUrl: null }
  if (type === 'SLIDE') return { ...base, title: '', contentMarkdown: '' }
  const q = { ...base, text: '', timeLimit: 30, pointsMultiplier: 1 }
  if (type === 'quiz') return { ...q, options: ['', '', '', ''], correctIndices: [] }
  if (type === 'truefalse') return { ...q, options: ['True', 'False'], correctIndex: 0 }
  if (type === 'typeAnswer') return { ...q, acceptedAnswers: [''] }
  if (type === 'slider') return { ...q, min: 0, max: 100, correctValue: 50, tolerance: 10 }
  if (type === 'puzzle') return { ...q, blocks: [{ id: 0, label: '' }, { id: 1, label: '' }, { id: 2, label: '' }, { id: 3, label: '' }], correctOrder: [0, 1, 2, 3] }
  // Unscored
  if (type === 'poll') return { ...q, options: ['', '', '', ''], pointsMultiplier: 0 }
  return { ...q, pointsMultiplier: 0 }
}

interface QuizBuilderProps {
  initialQuiz?: any
  adminPassword: string
}

export function QuizBuilder({ initialQuiz, adminPassword }: QuizBuilderProps) {
  const router = useRouter()
  const [id, setId] = useState(initialQuiz?.id ?? `quiz-${Date.now()}`)
  const [title, setTitle] = useState(initialQuiz?.title ?? '')
  const [description, setDescription] = useState(initialQuiz?.description ?? '')
  const [requiresIdentifier, setRequiresIdentifier] = useState(initialQuiz?.requiresIdentifier ?? false)
  const [items, setItems] = useState<any[]>(initialQuiz?.items ?? [])
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null)

  function addItem(type: QuestionType) {
    const newItem = emptyItem(type, items.length)
    setItems((prev) => [...prev, newItem])
    setExpandedIdx(items.length)
  }

  function removeItem(i: number) {
    setItems((prev) => prev.filter((_, j) => j !== i).map((it, j) => ({ ...it, orderIndex: j })))
    setExpandedIdx(null)
  }

  function updateItem(i: number, patch: any) {
    setItems((prev) => prev.map((it, j) => j === i ? { ...it, ...patch } : it))
  }

  function moveItem(i: number, dir: -1 | 1) {
    const j = i + dir
    if (j < 0 || j >= items.length) return
    const next = [...items]
    ;[next[i], next[j]] = [next[j], next[i]]
    next[i].orderIndex = i; next[j].orderIndex = j
    setItems(next)
  }

  async function save() {
    if (!title.trim()) { setSaveError('Title is required'); return }
    if (!id.trim()) { setSaveError('ID is required'); return }
    setSaving(true); setSaveError('')
    const quiz = { id: id.trim(), title: title.trim(), description, requiresIdentifier, items }
    const res = await fetch('/api/admin/quizzes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-admin-password': adminPassword },
      body: JSON.stringify(quiz),
    })
    setSaving(false)
    if (res.ok) {
      router.push('/admin')
    } else {
      const err = await res.json()
      setSaveError(err.error ?? 'Save failed')
    }
  }

  return (
    <div className="max-w-3xl mx-auto p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">{initialQuiz ? 'Edit Quiz' : 'New Quiz'}</h1>
        <button onClick={() => router.push('/admin')} className="text-gray-400 hover:text-white text-sm">
          ← Back
        </button>
      </div>

      {/* Quiz metadata */}
      <div className="bg-gray-800 rounded-2xl p-6 mb-6 flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs text-gray-400 mb-1 block">Quiz ID (used as filename)</label>
            <input value={id} onChange={(e) => setId(e.target.value.replace(/\s/g, '-').toLowerCase())}
              className="w-full bg-gray-900 border border-gray-700 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="my-quiz-id"
            />
          </div>
          <div>
            <label className="text-xs text-gray-400 mb-1 block">Title</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)}
              className="w-full bg-gray-900 border border-gray-700 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="Quiz title"
            />
          </div>
        </div>
        <div>
          <label className="text-xs text-gray-400 mb-1 block">Description</label>
          <input value={description} onChange={(e) => setDescription(e.target.value)}
            className="w-full bg-gray-900 border border-gray-700 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            placeholder="Short description"
          />
        </div>
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input type="checkbox" checked={requiresIdentifier} onChange={(e) => setRequiresIdentifier(e.target.checked)}
            className="w-4 h-4 accent-indigo-500" />
          Require Email / Employee ID from players
        </label>
      </div>

      {/* Items */}
      <div className="flex flex-col gap-3 mb-6">
        {items.map((item, i) => (
          <ItemEditor
            key={item.id}
            item={item}
            index={i}
            total={items.length}
            expanded={expandedIdx === i}
            onToggle={() => setExpandedIdx(expandedIdx === i ? null : i)}
            onChange={(patch) => updateItem(i, patch)}
            onRemove={() => removeItem(i)}
            onMove={(dir) => moveItem(i, dir)}
          />
        ))}
        {items.length === 0 && (
          <p className="text-gray-600 text-sm text-center py-8">Add your first item below</p>
        )}
      </div>

      {/* Add item buttons */}
      <div className="bg-gray-900 rounded-2xl p-4 mb-6">
        <p className="text-xs text-gray-500 mb-3 font-semibold uppercase tracking-wider">Add Item</p>
        <div className="flex flex-wrap gap-2">
          {(['SLIDE', ...SCORED_TYPES, ...UNSCORED_TYPES] as QuestionType[]).map((type) => (
            <button key={type} onClick={() => addItem(type)}
              className="bg-gray-700 hover:bg-gray-600 px-3 py-1.5 rounded-lg text-xs font-semibold transition"
            >
              + {type}
            </button>
          ))}
        </div>
      </div>

      {/* Save */}
      {saveError && <p className="text-red-400 text-sm mb-3">{saveError}</p>}
      <button
        onClick={save}
        disabled={saving}
        className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 py-4 rounded-2xl font-bold text-lg transition"
      >
        {saving ? 'Saving…' : 'Save Quiz'}
      </button>
    </div>
  )
}

// ── Item editor ────────────────────────────────────────────────────────────────
function ItemEditor({ item, index, total, expanded, onToggle, onChange, onRemove, onMove }: any) {
  const label = item.type === 'SLIDE' ? `Slide: ${item.title || '(untitled)'}` : `${index + 1}. [${item.type}] ${item.text || '(no text)'}`

  return (
    <div className="bg-gray-800 rounded-xl overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 cursor-pointer" onClick={onToggle}>
        <div className="flex flex-col gap-0.5">
          <button onClick={(e) => { e.stopPropagation(); onMove(-1) }} disabled={index === 0} className="text-gray-500 hover:text-white disabled:opacity-20 text-xs">▲</button>
          <button onClick={(e) => { e.stopPropagation(); onMove(1) }} disabled={index === total - 1} className="text-gray-500 hover:text-white disabled:opacity-20 text-xs">▼</button>
        </div>
        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${item.type === 'SLIDE' ? 'bg-blue-900 text-blue-300' : 'bg-indigo-900 text-indigo-300'}`}>{item.type}</span>
        <span className="flex-1 text-sm truncate text-gray-300">{label}</span>
        <button onClick={(e) => { e.stopPropagation(); onRemove() }} className="text-red-500 hover:text-red-400 text-xs px-2">✕</button>
        <span className="text-gray-600 text-xs">{expanded ? '▲' : '▼'}</span>
      </div>

      {expanded && (
        <div className="px-4 pb-4 border-t border-gray-700 pt-4 flex flex-col gap-3">
          {item.type === 'SLIDE' && <SlideFields item={item} onChange={onChange} />}
          {item.type !== 'SLIDE' && <QuestionFields item={item} onChange={onChange} />}
        </div>
      )}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs text-gray-400 mb-1 block">{label}</label>
      {children}
    </div>
  )
}

function TextInput({ value, onChange, placeholder = '', className = '' }: any) {
  return (
    <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
      className={`w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 ${className}`}
    />
  )
}

function SlideFields({ item, onChange }: any) {
  return (
    <>
      <Field label="Title"><TextInput value={item.title} onChange={(v: string) => onChange({ title: v })} placeholder="Slide title" /></Field>
      <Field label="Content (Markdown)">
        <textarea value={item.contentMarkdown} onChange={(e) => onChange({ contentMarkdown: e.target.value })}
          placeholder="Slide content in Markdown…" rows={4}
          className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
        />
      </Field>
    </>
  )
}

function QuestionFields({ item, onChange }: any) {
  const isScored = !['poll', 'wordcloud', 'brainstorm', 'openended'].includes(item.type)
  return (
    <>
      <Field label="Question text"><TextInput value={item.text ?? ''} onChange={(v: string) => onChange({ text: v })} placeholder="Question text" /></Field>

      {/* Options for quiz/truefalse/poll */}
      {['quiz', 'poll'].includes(item.type) && (
        <Field label="Options">
          <div className="flex flex-col gap-2">
            {(item.options ?? []).map((opt: string, i: number) => (
              <div key={i} className="flex gap-2 items-center">
                {item.type === 'quiz' && (
                  <input type="checkbox" checked={(item.correctIndices ?? []).includes(i)}
                    onChange={(e) => {
                      const ci = new Set(item.correctIndices ?? [])
                      e.target.checked ? ci.add(i) : ci.delete(i)
                      onChange({ correctIndices: [...ci] })
                    }}
                    className="accent-green-500 w-4 h-4 flex-shrink-0"
                    title="Mark as correct"
                  />
                )}
                <TextInput value={opt} onChange={(v: string) => {
                  const opts = [...(item.options ?? [])]
                  opts[i] = v
                  onChange({ options: opts })
                }} placeholder={`Option ${i + 1}`} />
              </div>
            ))}
          </div>
          <p className="text-xs text-gray-500 mt-1">{item.type === 'quiz' ? 'Check correct option(s)' : 'Poll options'}</p>
        </Field>
      )}

      {item.type === 'truefalse' && (
        <Field label="Correct answer">
          <select value={item.correctIndex ?? 0} onChange={(e) => onChange({ correctIndex: Number(e.target.value) })}
            className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm w-full">
            <option value={0}>True</option>
            <option value={1}>False</option>
          </select>
        </Field>
      )}

      {item.type === 'typeAnswer' && (
        <Field label="Accepted answers (one per line)">
          <textarea
            value={(item.acceptedAnswers ?? []).join('\n')}
            onChange={(e) => onChange({ acceptedAnswers: e.target.value.split('\n').filter(Boolean) })}
            rows={3} placeholder="Paris&#10;paris&#10;PARIS"
            className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
          />
        </Field>
      )}

      {item.type === 'slider' && (
        <div className="grid grid-cols-4 gap-2">
          {[['Min', 'min'], ['Max', 'max'], ['Correct', 'correctValue'], ['Tolerance', 'tolerance']].map(([label, key]) => (
            <Field key={key} label={label}>
              <input type="number" value={item[key] ?? 0} onChange={(e) => onChange({ [key]: Number(e.target.value) })}
                className="w-full bg-gray-900 border border-gray-700 rounded-lg px-2 py-2 text-sm focus:outline-none" />
            </Field>
          ))}
        </div>
      )}

      {item.type === 'puzzle' && (
        <Field label="Blocks (correct order = top to bottom)">
          <div className="flex flex-col gap-2">
            {(item.blocks ?? []).map((b: any, i: number) => (
              <TextInput key={i} value={b.label} onChange={(v: string) => {
                const blocks = [...(item.blocks ?? [])]
                blocks[i] = { ...blocks[i], label: v }
                onChange({ blocks })
              }} placeholder={`Block ${i + 1}`} />
            ))}
          </div>
        </Field>
      )}

      {/* Timing and scoring */}
      <div className="grid grid-cols-2 gap-3">
        <Field label={`Time limit (seconds, 0 = untimed)`}>
          <input type="number" min={0} max={240} value={item.timeLimit ?? 30}
            onChange={(e) => onChange({ timeLimit: Number(e.target.value) || null })}
            className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none"
          />
        </Field>
        {isScored && (
          <Field label="Points multiplier">
            <select value={item.pointsMultiplier ?? 1} onChange={(e) => onChange({ pointsMultiplier: Number(e.target.value) })}
              className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm w-full">
              <option value={0}>0 (no points)</option>
              <option value={1}>1×</option>
              <option value={2}>2× double</option>
            </select>
          </Field>
        )}
      </div>

      <Field label="Media URL (image/video, optional)">
        <TextInput value={item.mediaUrl ?? ''} onChange={(v: string) => onChange({ mediaUrl: v || null })} placeholder="https://…" />
      </Field>
    </>
  )
}
