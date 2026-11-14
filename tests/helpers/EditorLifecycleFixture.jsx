import { useState } from 'react'
import NoteEditor from '../../src/components/documentation/NoteEditor.jsx'

export default function EditorLifecycleFixture() {
  const [note, setNote] = useState({
    id: 'lifecycle-note', title: 'Lifecycle note',
    content: { type: 'doc', content: [{ type: 'paragraph' }] },
    projectId: null, folderId: null, tagIds: [],
    createdAt: '2026-11-14T10:00:00Z', updatedAt: '2026-11-14T10:00:00Z',
  })
  return <>
    <button onClick={() => setNote(current => ({ ...current, content: structuredClone(current.content) }))}>Refresh note record</button>
    <NoteEditor note={note} projects={[]} status="saved" readOnly={false}
      store={{ update: (_id, patch) => setNote(current => ({ ...current, ...patch })), flush: async () => {} }}
      organization={{ folders: [], tags: [], readOnly: false, onSearch() {}, onManageTags() {} }}
      onMetadataChange={() => {}} />
  </>
}
