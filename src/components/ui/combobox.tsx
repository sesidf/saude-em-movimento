"use client";

import * as React from "react";
import { Check, ChevronsUpDown } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

export interface ComboboxOption {
  value: string;
  label: string;
  render?: React.ReactNode;
  color?: string;
  searchText?: string;
}

interface ComboboxProps {
  options: ComboboxOption[];
  value?: string;
  onChange: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: React.ReactNode;
  disabled?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  className?: string;
  allowCustomValue?: boolean;
  isLoading?: boolean;
  onSearch?: (search: string) => void;
}

export function Combobox({
  options,
  value,
  onChange,
  placeholder = "Selecione...",
  searchPlaceholder = "Buscar...",
  emptyText = "Nenhum resultado.",
  disabled = false,
  className,
  allowCustomValue = false,
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
  isLoading = false,
  onSearch,
}: ComboboxProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(false);
  const open = controlledOpen !== undefined ? controlledOpen : uncontrolledOpen;
  const setOpen = controlledOnOpenChange !== undefined ? controlledOnOpenChange : setUncontrolledOpen;
  const [search, setSearch] = React.useState("");

  // Otimização para listas grandes
  const filteredOptions = React.useMemo(() => {
    if (!search) return options.slice(0, 60);
    const searchLower = search.toLowerCase();
    return options.filter((opt) => {
      const searchableValue = (
        opt.searchText
          ? `${opt.label} | ${opt.value} | ${opt.searchText}`
          : opt.value
            ? `${opt.label} | ${opt.value}`
            : opt.label
      ).toLowerCase();
      return searchableValue.includes(searchLower);
    }).slice(0, 60);
  }, [options, search]);

  const selectedOption = React.useMemo(() => {
    return options.find((option) => option.value === value);
  }, [options, value]);

  return (
    <Popover open={open} onOpenChange={setOpen} modal={true}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn(
            "w-full justify-between font-medium px-3 h-9 rounded-lg border-slate-300 bg-white text-xs text-slate-800 shadow-2xs hover:bg-slate-50 transition-all",
            className,
          )}
          disabled={disabled}
        >
          <span className="truncate block text-left flex-1">
            {selectedOption ? (
              selectedOption.render || selectedOption.label
            ) : (
              placeholder
            )}
          </span>
          <ChevronsUpDown className="ml-2 h-3.5 w-3.5 shrink-0 text-slate-400 opacity-70" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-auto min-w-[--radix-popover-trigger-width] max-w-[90vw] p-0 shadow-2xl border border-slate-200 bg-white rounded-lg overflow-hidden"
        align="start"
      >
        <Command shouldFilter={false} className="rounded-lg">
          <CommandInput
            placeholder={searchPlaceholder}
            value={search}
            onValueChange={(val) => {
              setSearch(val);
              onSearch?.(val);
            }}
          />
          <CommandList>
            {isLoading ? (
              <div className="py-6 text-center text-xs text-slate-500 flex flex-col items-center justify-center gap-2">
                <div className="h-3.5 w-3.5 rounded-full border-2 border-slate-200 border-t-slate-500 animate-spin" />
                Carregando...
              </div>
            ) : filteredOptions.length === 0 ? (
              <div className="py-6 text-center text-xs text-slate-500">
                {allowCustomValue && search.length > 0 ? (
                  <div
                    className="px-2 py-1.5 text-xs cursor-pointer hover:bg-slate-100 rounded-md"
                    onClick={() => {
                      onChange(search);
                      setOpen(false);
                      setSearch("");
                    }}
                  >
                    Usar: "{search}"
                  </div>
                ) : (
                  emptyText
                )}
              </div>
            ) : (
              <CommandGroup>
                {filteredOptions.map((option, index) => {
                  const uniqueValue = option.value
                    ? `${option.label} | ${option.value}`
                    : option.label;
                  return (
                    <CommandItem
                      key={option.value || `empty-opt-${index}`}
                      value={uniqueValue}
                      onSelect={() => {
                        onChange(value === option.value ? "" : option.value);
                        setOpen(false);
                        setSearch("");
                      }}
                      style={
                        option.color
                          ? ({
                              "--hover-bg": `${option.color}20`,
                              "--hover-text": option.color,
                            } as React.CSSProperties)
                          : undefined
                      }
                      className={cn(
                        "rounded-md my-0.5 px-2.5 py-1.5 transition-colors cursor-pointer whitespace-nowrap",
                        option.color &&
                          "data-[selected='true']:!bg-[var(--hover-bg)] data-[selected='true']:!text-[var(--hover-text)]",
                      )}
                    >
                      <Check
                        className={cn(
                          "mr-2 h-3.5 w-3.5 flex-shrink-0 text-blue-600",
                          value === option.value ? "opacity-100" : "opacity-0",
                          option.color && "text-[var(--hover-text)]",
                        )}
                      />
                      <div className="flex-1 whitespace-nowrap">
                        {option.render ? (
                          option.render
                        ) : (
                          <span className="whitespace-nowrap">{option.label}</span>
                        )}
                      </div>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
