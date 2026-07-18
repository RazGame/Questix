import { useEffect, useRef } from 'react';
import {
  Bold,
  Heading2,
  Image,
  Italic,
  Link,
  List,
  ListOrdered,
  Pilcrow,
  Table,
  Underline,
} from 'lucide-react';

interface RichTextEditorProps {
  value: string;
  onChange: (value: string) => void;
}

export default function RichTextEditor({ value, onChange }: RichTextEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (editorRef.current && editorRef.current.innerHTML !== value) {
      editorRef.current.innerHTML = value;
    }
  }, [value]);

  const runCommand = (command: string, commandValue?: string) => {
    editorRef.current?.focus();
    document.execCommand(command, false, commandValue);
    onChange(editorRef.current?.innerHTML || '');
  };

  const insertLink = () => {
    const url = window.prompt('URL ссылки');
    if (url) {
      runCommand('createLink', url);
    }
  };

  const insertImage = () => {
    const url = window.prompt('URL картинки');
    if (!url) return;

    runCommand(
      'insertHTML',
      `<img src="${url}" alt="" style="max-width: 100%; height: auto;" />`
    );
  };

  const insertTable = () => {
    const rows = Math.min(Math.max(Number(window.prompt('Количество строк', '3')) || 3, 1), 12);
    const cols = Math.min(Math.max(Number(window.prompt('Количество колонок', '3')) || 3, 1), 8);
    const cells = Array.from({ length: cols }, () => '<td>Текст</td>').join('');
    const body = Array.from({ length: rows }, () => `<tr>${cells}</tr>`).join('');

    runCommand('insertHTML', `<table><tbody>${body}</tbody></table><p><br></p>`);
  };

  const toolbar = [
    { icon: Bold, label: 'Жирный', action: () => runCommand('bold') },
    { icon: Italic, label: 'Курсив', action: () => runCommand('italic') },
    { icon: Underline, label: 'Подчеркнуть', action: () => runCommand('underline') },
    { icon: Heading2, label: 'Заголовок', action: () => runCommand('formatBlock', 'h2') },
    { icon: Pilcrow, label: 'Абзац', action: () => runCommand('formatBlock', 'p') },
    { icon: List, label: 'Список', action: () => runCommand('insertUnorderedList') },
    { icon: ListOrdered, label: 'Нумерованный список', action: () => runCommand('insertOrderedList') },
    { icon: Link, label: 'Ссылка', action: insertLink },
    { icon: Image, label: 'Картинка', action: insertImage },
    { icon: Table, label: 'Таблица', action: insertTable },
  ];

  return (
    <div className="overflow-hidden rounded-lg border border-white/10 bg-white/[0.03]">
      <div className="flex flex-wrap gap-1 border-b border-white/10 bg-white/[0.04] p-2">
        {toolbar.map(({ icon: Icon, label, action }) => (
          <button
            key={label}
            type="button"
            onClick={action}
            className="rounded-md p-2 text-zinc-300 transition hover:bg-white/10 hover:text-white"
            title={label}
          >
            <Icon size={17} />
          </button>
        ))}
      </div>
      <div
        ref={editorRef}
        contentEditable
        onInput={() => onChange(editorRef.current?.innerHTML || '')}
        className="rich-editor-content min-h-[18rem] px-4 py-3 text-sm text-zinc-100 outline-none"
      />
    </div>
  );
}
