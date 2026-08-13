import { useEffect, useRef, useState } from 'react'
import type { BlockNoteEditor, PartialBlock } from '@blocknote/core'
import { useCreateBlockNote } from '@blocknote/react'
import { BlockNoteView } from '@blocknote/mantine'
import type { Theme } from '@blocknote/mantine'
import '@blocknote/core/fonts/inter.css'
import '@blocknote/mantine/style.css'
import { flowStateApi } from '../api/client'
import { ErrorBanner } from '../components/ErrorBanner'

const AUTOSAVE_DEBOUNCE_MS = 800

/**
 * Maps BlockNote's theme slots onto FlowState's existing design tokens. BlockNote
 * writes each value straight into a `--bn-*` CSS custom property on the editor
 * root, so `var(--token)` references resolve against `:root` at paint time — no
 * new colors are introduced here.
 */
const flowStateBlockNoteTheme: Theme = {
  colors: {
    editor: { text: 'var(--text-primary)', background: 'var(--surface-1)' },
    menu: { text: 'var(--text-primary)', background: 'var(--surface-2)' },
    tooltip: { text: 'var(--text-secondary)', background: 'var(--surface-3)' },
    hovered: { text: 'var(--text-primary)', background: 'var(--surface-3)' },
    selected: { text: 'var(--bg)', background: 'var(--accent)' },
    disabled: { text: 'var(--text-muted)', background: 'var(--surface-2)' },
    shadow: 'var(--border)',
    border: 'var(--border)',
    sideMenu: 'var(--text-muted)'
  },
  borderRadius: 6,
  fontFamily: 'var(--sans)'
}

interface JournalEntryEditorProps {
  date: string
  onEditorReady?: (editor: BlockNoteEditor) => void
  onSaved?: () => void
}

export function JournalEntryEditor({
  date,
  onEditorReady,
  onSaved
}: JournalEntryEditorProps): JSX.Element {
  const [initialContent, setInitialContent] = useState<PartialBlock[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setInitialContent(null)
    flowStateApi.journalEntries
      .getByDate(date)
      .then((entry) => {
        setInitialContent(entry ? (JSON.parse(entry.content) as PartialBlock[]) : [])
      })
      .catch((err: unknown) => {
        setError(`Could not load journal entry: ${err instanceof Error ? err.message : String(err)}`)
        setInitialContent([])
      })
  }, [date])

  if (initialContent === null) {
    return <p className="journal-editor-loading">Loading…</p>
  }

  return (
    <div className="journal-editor">
      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}
      <JournalEntryEditorBody
        key={date}
        date={date}
        initialContent={initialContent}
        onEditorReady={onEditorReady}
        onSaved={onSaved}
        onSaveError={setError}
      />
    </div>
  )
}

interface JournalEntryEditorBodyProps {
  date: string
  initialContent: PartialBlock[]
  onEditorReady?: (editor: BlockNoteEditor) => void
  onSaved?: () => void
  onSaveError: (message: string) => void
}

function JournalEntryEditorBody({
  date,
  initialContent,
  onEditorReady,
  onSaved,
  onSaveError
}: JournalEntryEditorBodyProps): JSX.Element {
  const editor = useCreateBlockNote({
    initialContent: initialContent.length > 0 ? initialContent : undefined,
    uploadFile: async (file: File): Promise<string> => {
      const buffer = await file.arrayBuffer()
      let binary = ''
      const bytes = new Uint8Array(buffer)
      for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
      const base64 = btoa(binary)
      try {
        return await flowStateApi.media.saveImage(base64, file.type)
      } catch (err) {
        // Surface the failure in the app's error banner, then re-throw so
        // BlockNote still renders its own broken-image placeholder.
        onSaveError(`Could not upload image: ${err instanceof Error ? err.message : String(err)}`)
        throw err
      }
    }
  })

  useEffect(() => {
    onEditorReady?.(editor)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor])

  const saveTimeout = useRef<ReturnType<typeof setTimeout>>()

  function handleChange(): void {
    if (saveTimeout.current) clearTimeout(saveTimeout.current)
    saveTimeout.current = setTimeout(() => {
      flowStateApi.journalEntries
        .upsert({ date, content: JSON.stringify(editor.document) })
        .then(() => onSaved?.())
        .catch((err: unknown) => {
          onSaveError(
            `Could not save journal entry: ${err instanceof Error ? err.message : String(err)}`
          )
        })
    }, AUTOSAVE_DEBOUNCE_MS)
  }

  return <BlockNoteView editor={editor} theme={flowStateBlockNoteTheme} onChange={handleChange} />
}
