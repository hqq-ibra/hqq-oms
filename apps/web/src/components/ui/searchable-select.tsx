'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import { ChevronDown, Pencil, Plus, Trash2 } from 'lucide-react';

const DEBOUNCE_MS = 300;

export interface SearchableSelectOption {
  value: string;
  label: string;
  sublabel?: string;
}

export interface SearchableSelectProps {
  label?: string;
  placeholder?: string;
  value: string;
  onChange: (value: string, option?: SearchableSelectOption) => void;
  options: SearchableSelectOption[];
  onSearch?: (query: string) => void;
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  loading?: boolean;
  error?: string;
  disabled?: boolean;
  emptyMessage?: string;
  renderOption?: (opt: SearchableSelectOption) => React.ReactNode;
  creatable?: boolean;
  createLabel?: string;
  onCreateOption?: (inputValue: string) => SearchableSelectOption;
  onDeleteOption?: (value: string) => void;
  onEditOption?: (value: string, option: SearchableSelectOption) => void;
  onAddClick?: () => void;
  addCustomOption?: (opt: SearchableSelectOption) => void;
}

export function SearchableSelect({
  label,
  placeholder = 'Search...',
  value,
  onChange,
  options,
  onSearch,
  searchValue = '',
  onSearchChange,
  loading = false,
  error,
  disabled,
  emptyMessage = 'No results found',
  renderOption,
  creatable = false,
  createLabel = 'إضافة',
  onCreateOption,
  onDeleteOption,
  onEditOption,
  onAddClick,
  addCustomOption,
}: SearchableSelectProps) {
  const [open, setOpen] = React.useState(false);
  const [localSearch, setLocalSearch] = React.useState(searchValue);
  const [customOptions, setCustomOptions] = React.useState<SearchableSelectOption[]>([]);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const debounceRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const allOptions = React.useMemo(
    () => [...options, ...customOptions],
    [options, customOptions]
  );

  const selectedOption = allOptions.find((o) => o.value === value);

  React.useEffect(() => {
    setLocalSearch(searchValue);
  }, [searchValue]);

  React.useEffect(() => {
    if (!onSearch) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      onSearch(localSearch);
      debounceRef.current = null;
    }, DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [localSearch, onSearch]);

  React.useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = (opt: SearchableSelectOption) => {
    onChange(opt.value, opt);
    setOpen(false);
    setLocalSearch('');
    onSearchChange?.('');
  };

  const handleCreate = (name: string) => {
    const newOpt: SearchableSelectOption = onCreateOption
      ? onCreateOption(name)
      : { value: name, label: name };
    setCustomOptions((prev) =>
      prev.some((o) => o.value === newOpt.value) ? prev : [...prev, newOpt]
    );
    handleSelect(newOpt);
  };

  const addAndSelect = React.useCallback((opt: SearchableSelectOption) => {
    setCustomOptions((prev) =>
      prev.some((o) => o.value === opt.value) ? prev : [...prev, opt]
    );
    onChange(opt.value, opt);
    setOpen(false);
    setLocalSearch('');
    onSearchChange?.('');
  }, [onChange, onSearchChange]);

  const filteredOptions = onSearch
    ? allOptions
    : allOptions.filter(
        (o) =>
          o.label.toLowerCase().includes(localSearch.toLowerCase()) ||
          (o.sublabel?.toLowerCase().includes(localSearch.toLowerCase()) ?? false)
      );

  const trimmedSearch = localSearch.trim();
  const exactMatch =
    trimmedSearch.length > 0 &&
    allOptions.some(
      (o) => o.label === trimmedSearch || o.value === trimmedSearch
    );
  const showCreateOption = creatable && trimmedSearch.length > 0 && !exactMatch;
  const showCreateButton = creatable && !showCreateOption;

  return (
    <div ref={containerRef} className="relative w-full">
      {label && (
        <label className="mb-1.5 block text-sm font-medium text-gray-700">
          {label}
        </label>
      )}
      <div
        className={cn(
          'flex min-h-10 w-full cursor-pointer items-center justify-between rounded-lg border bg-white px-3 py-2 text-sm',
          'transition-colors focus-within:ring-2 focus-within:ring-[#DC2626] focus-within:ring-offset-1',
          error
            ? 'border-red-500'
            : 'border-gray-300 hover:border-gray-400',
          disabled && 'cursor-not-allowed opacity-50'
        )}
        onClick={() => !disabled && setOpen(!open)}
      >
        <span className={cn(!selectedOption && 'text-gray-500')}>
          {selectedOption
            ? selectedOption.sublabel
              ? `${selectedOption.sublabel} - ${selectedOption.label}`
              : selectedOption.label
            : placeholder}
        </span>
        <ChevronDown
          className={cn('h-4 w-4 text-gray-400 transition-transform', open && 'rotate-180')}
        />
      </div>
      {open && (
        <div className="absolute z-50 mt-1 w-full overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg">
          <div className="border-b border-gray-200 p-2">
            <input
              ref={inputRef}
              type="text"
              value={localSearch}
              onChange={(e) => {
                setLocalSearch(e.target.value);
                onSearchChange?.(e.target.value);
              }}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === 'Enter' && showCreateOption) {
                  e.preventDefault();
                  handleCreate(trimmedSearch);
                }
              }}
              placeholder="Type to search..."
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#DC2626]"
              autoFocus
            />
          </div>
          <div className="max-h-48 overflow-auto py-1">
            {loading ? (
              <div className="px-4 py-8 text-center text-sm text-gray-500">
                Loading...
              </div>
            ) : filteredOptions.length === 0 && !showCreateOption ? (
              <div className="px-4 py-8 text-center text-sm text-gray-500">
                {emptyMessage}
              </div>
            ) : (
              <>
                {filteredOptions.map((opt) => (
                  <div
                    key={opt.value}
                    className={cn(
                      'group flex w-full items-center text-sm transition-colors',
                      opt.value === value
                        ? 'bg-red-50 text-[#DC2626]'
                        : 'hover:bg-gray-50'
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => handleSelect(opt)}
                      className="flex-1 px-4 py-2 text-left"
                    >
                      {renderOption
                        ? renderOption(opt)
                        : opt.sublabel
                          ? `${opt.sublabel} - ${opt.label}`
                          : opt.label}
                    </button>
                    {(onEditOption || onDeleteOption) && (
                      <div className="flex shrink-0 items-center opacity-0 transition-all group-hover:opacity-100">
                        {onEditOption && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setOpen(false);
                              onEditOption(opt.value, opt);
                            }}
                            className="p-2 text-gray-300 hover:text-blue-500"
                            title={`Edit ${opt.label}`}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                        )}
                        {onDeleteOption && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onDeleteOption(opt.value);
                            }}
                            className="p-2 text-gray-300 hover:text-red-500"
                            title={`Delete ${opt.label}`}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                ))}
                {showCreateOption && (
                  <button
                    type="button"
                    onClick={() => {
                      if (onAddClick) {
                        setOpen(false);
                        onAddClick();
                      } else {
                        handleCreate(trimmedSearch);
                      }
                    }}
                    className="flex w-full items-center gap-2 border-t border-gray-100 px-4 py-2 text-left text-sm font-medium text-[#DC2626] hover:bg-red-50"
                  >
                    <Plus className="h-4 w-4" />
                    {createLabel}: {trimmedSearch}
                  </button>
                )}
                {showCreateButton && (
                  <button
                    type="button"
                    onClick={() => {
                      if (onAddClick) {
                        setOpen(false);
                        onAddClick();
                      } else {
                        inputRef.current?.focus();
                      }
                    }}
                    className="flex w-full items-center gap-2 border-t border-gray-100 px-4 py-2 text-left text-sm font-medium text-gray-400 hover:bg-gray-50 hover:text-[#DC2626]"
                  >
                    <Plus className="h-4 w-4" />
                    {createLabel}...
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      )}
      {error && (
        <p className="mt-1.5 text-sm text-red-600" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
