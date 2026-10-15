'use client';

import { useId, useRef, useState } from 'react';

interface Props {
  id?: string;
  disabled?: boolean;
  value: string;
  models: string[];
  label: string;
  placeholder?: string;
  onChange: (model: string) => void;
}

export default function ModelCombobox({ id, disabled = false, value, models, label, placeholder, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const input = useRef<HTMLInputElement>(null);
  const listId = useId();
  const toggle = () => {
    setOpen(!open);
    setActive(models.indexOf(value));
  };
  const select = (model: string) => {
    onChange(model);
    setOpen(false);
    input.current?.focus();
  };

  return (
    <div
      className="relative min-w-0 flex-1"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
    >
      <div className="flex border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700">
        <input
          id={id}
          disabled={disabled}
          ref={input}
          type="text"
          role="combobox"
          aria-label={label}
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="none"
          aria-activedescendant={open && active >= 0 ? `${listId}-${active}` : undefined}
          autoComplete="off"
          value={value}
          placeholder={placeholder}
          onChange={(event) => { onChange(event.target.value); setActive(-1); }}
          onKeyDown={(event) => {
            if (event.key === 'Escape') setOpen(false);
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
              event.preventDefault();
              setOpen(true);
              setActive(index => {
                if (!models.length) return -1;
                if (index < 0) return event.key === 'ArrowDown' ? 0 : models.length - 1;
                return (index + (event.key === 'ArrowDown' ? 1 : -1) + models.length) % models.length;
              });
            }
            if (event.key === 'Enter' && open && active >= 0 && models[active]) {
              event.preventDefault();
              select(models[active]);
            }
          }}
          className="min-w-0 w-full px-4 py-2 rounded-l-lg bg-transparent text-gray-900 dark:text-gray-100"
        />
        <button
          disabled={disabled}
          type="button"
          aria-label={label}
          aria-expanded={open}
          aria-controls={listId}
          onClick={toggle}
          className="px-3 rounded-r-lg text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-600"
        >
          <span aria-hidden="true">▾</span>
        </button>
      </div>
      {open && !disabled && (
        <div id={listId} role="listbox" aria-label={label} className="absolute z-20 mt-1 max-h-60 overflow-auto w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 shadow-lg">
          {models.map((model, index) => (
            <button
              key={model}
              id={`${listId}-${index}`}
              type="button"
              role="option"
              aria-selected={model === value}
              tabIndex={-1}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => select(model)}
              className={`block w-full px-4 py-2 text-left break-all text-gray-900 dark:text-gray-100 hover:bg-purple-100 dark:hover:bg-purple-900 ${index === active || model === value ? 'bg-purple-100 dark:bg-purple-900' : ''}`}
            >{model}</button>
          ))}
        </div>
      )}
    </div>
  );
}
