import * as React from "react";
import { Check, ChevronDown, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
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
import { Badge } from "@/components/ui/badge";

type MultiSelectOption = {
  label: string;
  value: string;
  render?: React.ReactNode;
};

interface MultiSelectProps {
  options: MultiSelectOption[];
  selected: string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
  emptyMessage?: string;
  className?: string;
  disabled?: boolean;
}

export function MultiSelect({
  options,
  selected,
  onChange,
  placeholder = "Selecione...",
  emptyMessage = "Nenhum resultado.",
  className,
  disabled,
}: MultiSelectProps) {
  const [open, setOpen] = React.useState(false);

  const handleUnselect = (item: string) => {
    onChange(selected.filter((i) => i !== item));
  };

  return (
    <Popover open={open} onOpenChange={setOpen} modal={true}>
      <PopoverTrigger asChild>
        <button
          type="button"
          role="combobox"
          aria-expanded={open}
          className={cn(
            "flex min-h-11 w-full items-center justify-between rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-left text-[13px] text-slate-800 shadow-sm transition-all duration-200 placeholder:text-slate-400 hover:border-slate-300 focus:outline-none focus:border-slate-300 focus:ring-0 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400 disabled:border-slate-200",
            className
          )}
          disabled={disabled}
        >
          <div className="flex flex-wrap gap-1 items-center flex-1 pr-2 min-w-0">
            {selected.length === 0 && (
              <span className="text-slate-400 font-bold text-xs">{placeholder}</span>
            )}
            {selected.map((val) => {
              const opt = options.find((o) => o.value === val);
              return opt ? (
                <Badge
                  key={val}
                  variant="secondary"
                  className="mr-1 mb-1 max-w-full bg-slate-100 hover:bg-slate-200 text-slate-800 border-none font-medium h-6 rounded-md flex items-center gap-1 pr-1"
                >
                  <span className="truncate">{opt.label}</span>
                  <div
                    role="button"
                    tabIndex={0}
                    className="rounded-full bg-slate-200 hover:bg-slate-300 p-0.5"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleUnselect(val);
                    }}
                  >
                    <X className="h-3 w-3 text-slate-600" />
                  </div>
                </Badge>
              ) : null;
            })}
          </div>
          <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-auto min-w-[--radix-popover-trigger-width] max-w-[90vw] p-0 shadow-2xl border border-slate-200 bg-white rounded-lg overflow-hidden"
        align="start"
      >
        <Command>
          <CommandInput placeholder="Buscar..." />
          <CommandList>
            <CommandEmpty>{emptyMessage}</CommandEmpty>
            <CommandGroup className="max-h-60 overflow-auto">
              {options.map((option) => {
                const isSelected = selected.includes(option.value);
                return (
                  <CommandItem
                    key={option.value}
                    onSelect={() => {
                      if (isSelected) {
                        onChange(selected.filter((item) => item !== option.value));
                      } else {
                        onChange([...selected, option.value]);
                      }
                    }}
                    className="cursor-pointer whitespace-nowrap px-2.5 py-1.5"
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4 flex-shrink-0 text-blue-600",
                        isSelected ? "opacity-100" : "opacity-0"
                      )}
                    />
                    <div className="flex-1 whitespace-nowrap">
                      {option.render ? option.render : <span>{option.label}</span>}
                    </div>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
