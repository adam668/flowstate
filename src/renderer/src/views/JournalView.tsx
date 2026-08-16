import { useEffect, useMemo, useState } from 'react'
import type { BlockNoteEditor, PartialBlock } from '@blocknote/core'
import { flowStateApi } from '../api/client'
import { JournalEntryEditor } from './JournalEntryEditor'
import { ErrorBanner } from '../components/ErrorBanner'
import type { JournalEntry, JournalTemplate } from '../../../shared/types'
import { toLocalDateString } from '../../../shared/date'

function extractPlainText(contentJson: string): string {
  try {
    const blocks = JSON.parse(contentJson) as Array<{ content?: Array<{ text?: string }> }>
    return blocks
      .flatMap((block) => block.content ?? [])
      .map((inline) => inline.text ?? '')
      .join(' ')
  } catch {
    return ''
  }
}

export function JournalView(): JSX.Element {
  const [entries, setEntries] = useState<JournalEntry[]>([])
  const [templates, setTemplates] = useState<JournalTemplate[]>([])
  const [search, setSearch] = useState('')
  const [selectedDate, setSelectedDate] = useState<string>(() => toLocalDateString(new Date()))
  const [activeEditor, setActiveEditor] = useState<BlockNoteEditor | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Electron's renderer has no `window.prompt` (it is a permanent, documented
  // limitation), so naming is done with inline controlled inputs instead.
  const [isNamingTemplate, setIsNamingTemplate] = useState(false)
  const [newTemplateName, setNewTemplateName] = useState('')
  const [renamingTemplateId, setRenamingTemplateId] = useState<number | null>(null)
  const [renameTemplateName, setRenameTemplateName] = useState('')

  function refreshEntries(): void {
    flowStateApi.journalEntries
      .list()
      .then(setEntries)
      .catch((err: unknown) => {
        setError(`Could not load journal entries: ${err instanceof Error ? err.message : String(err)}`)
      })
  }
  function refreshTemplates(): void {
    flowStateApi.journalTemplates
      .list()
      .then(setTemplates)
      .catch((err: unknown) => {
        setError(`Could not load templates: ${err instanceof Error ? err.message : String(err)}`)
      })
  }

  useEffect(() => {
    refreshEntries()
    refreshTemplates()
  }, [])

  const filteredEntries = useMemo(() => {
    if (!search.trim()) return entries
    const needle = search.toLowerCase()
    return entries.filter((entry) => extractPlainText(entry.content).toLowerCase().includes(needle))
  }, [entries, search])

  function applyTemplate(template: JournalTemplate): void {
    if (!activeEditor) return
    const blocks = JSON.parse(template.content) as PartialBlock[]
    const lastBlock = activeEditor.document[activeEditor.document.length - 1]
    activeEditor.insertBlocks(blocks, lastBlock, 'after')
  }

  function cancelNamingTemplate(): void {
    setIsNamingTemplate(false)
    setNewTemplateName('')
  }

  async function confirmSaveCurrentAsTemplate(): Promise<void> {
    const name = newTemplateName.trim()
    if (!activeEditor || !name) {
      cancelNamingTemplate()
      return
    }
    try {
      await flowStateApi.journalTemplates.create({
        name,
        content: JSON.stringify(activeEditor.document)
      })
      cancelNamingTemplate()
      refreshTemplates()
    } catch (err) {
      setError(`Could not save template: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  function startRenamingTemplate(template: JournalTemplate): void {
    setRenamingTemplateId(template.id)
    setRenameTemplateName(template.name)
  }

  function cancelRenamingTemplate(): void {
    setRenamingTemplateId(null)
    setRenameTemplateName('')
  }

  async function confirmRenameTemplate(id: number): Promise<void> {
    const name = renameTemplateName.trim()
    if (!name) {
      cancelRenamingTemplate()
      return
    }
    try {
      await flowStateApi.journalTemplates.update(id, { name })
      cancelRenamingTemplate()
      refreshTemplates()
    } catch (err) {
      setError(`Could not rename template: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  async function deleteTemplate(id: number): Promise<void> {
    if (!window.confirm('Delete this template? This cannot be undone.')) return
    try {
      await flowStateApi.journalTemplates.delete(id)
      refreshTemplates()
    } catch (err) {
      setError(`Could not delete template: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  async function handleDeleteEntry(date: string): Promise<void> {
    if (!window.confirm('Delete this journal entry? This cannot be undone.')) return
    try {
      await flowStateApi.journalEntries.delete(date)
      refreshEntries()
    } catch (err) {
      setError(`Could not delete journal entry: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  return (
    <div className="journal-view">
      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}
      <aside className="journal-sidebar">
        <input
          className="journal-search"
          placeholder="Search entries…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="journal-date-picker">
          <label className="field-label" htmlFor="journal-date">
            Date
          </label>
          <input
            id="journal-date"
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
          />
        </div>
        <ul className="journal-entry-list">
          {filteredEntries.map((entry) => (
            <li key={entry.id}>
              <button
                type="button"
                className={`journal-entry-item ${selectedDate === entry.date ? 'active' : ''}`}
                onClick={() => setSelectedDate(entry.date)}
              >
                {entry.date}
              </button>
              <button
                type="button"
                className="journal-entry-delete"
                onClick={() => handleDeleteEntry(entry.date)}
                aria-label={`Delete journal entry ${entry.date}`}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
        <div className="journal-templates">
          <div className="journal-templates-header">
            <span className="field-label">Templates</span>
            <button type="button" onClick={() => setIsNamingTemplate(true)}>
              Save current as template
            </button>
          </div>
          {isNamingTemplate && (
            <div className="journal-template-name-form">
              <input
                className="journal-template-name-input"
                placeholder="Template name…"
                aria-label="Template name"
                autoFocus
                value={newTemplateName}
                onChange={(e) => setNewTemplateName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void confirmSaveCurrentAsTemplate()
                  if (e.key === 'Escape') cancelNamingTemplate()
                }}
              />
              <button type="button" onClick={() => void confirmSaveCurrentAsTemplate()}>
                Save template
              </button>
              <button type="button" onClick={cancelNamingTemplate}>
                Cancel
              </button>
            </div>
          )}
          <ul className="journal-template-list">
            {templates.map((template) => (
              <li key={template.id} className="journal-template-item">
                {renamingTemplateId === template.id ? (
                  <>
                    <input
                      className="journal-template-name-input"
                      aria-label={`Rename template ${template.name}`}
                      autoFocus
                      value={renameTemplateName}
                      onChange={(e) => setRenameTemplateName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') void confirmRenameTemplate(template.id)
                        if (e.key === 'Escape') cancelRenamingTemplate()
                      }}
                    />
                    <button
                      type="button"
                      className="journal-template-name-action"
                      onClick={() => void confirmRenameTemplate(template.id)}
                    >
                      Save name
                    </button>
                    <button
                      type="button"
                      className="journal-template-name-action"
                      onClick={cancelRenamingTemplate}
                    >
                      Cancel
                    </button>
                  </>
                ) : (
                  <>
                    <button type="button" onClick={() => applyTemplate(template)}>
                      {template.name}
                    </button>
                    <button
                      type="button"
                      className="journal-template-rename"
                      onClick={() => startRenamingTemplate(template)}
                      aria-label={`Rename template ${template.name}`}
                    >
                      ✎
                    </button>
                    <button
                      type="button"
                      className="journal-template-delete"
                      onClick={() => deleteTemplate(template.id)}
                      aria-label={`Delete template ${template.name}`}
                    >
                      ×
                    </button>
                  </>
                )}
              </li>
            ))}
          </ul>
        </div>
      </aside>
      <div className="journal-editor-pane">
        <JournalEntryEditor
          key={selectedDate}
          date={selectedDate}
          onEditorReady={setActiveEditor}
          onSaved={refreshEntries}
        />
      </div>
    </div>
  )
}
