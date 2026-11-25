import React, { useEffect, useState } from "react";
import { fetchShareableUsers } from "../services/api";
import { Input } from "@/components/ui/input";
import { Check, Loader2, Search } from "lucide-react";

export interface ShareableUserItem {
  id: number;
  username: string;
  full_name?: string | null;
  share_count?: number;
}

interface ShareUserPickerProps {
  excludedUserIds?: number[];
  selectedUserId?: number | "";
  onSelectUser?: (user: ShareableUserItem) => void;
  renderUserExtra?: (user: ShareableUserItem) => React.ReactNode;
  renderUserAction?: (user: ShareableUserItem) => React.ReactNode;
  placeholder?: string;
}

export const ShareUserPicker: React.FC<ShareUserPickerProps> = ({
  excludedUserIds = [],
  selectedUserId,
  onSelectUser,
  renderUserExtra,
  renderUserAction,
  placeholder = "@usuario...",
}) => {
  const [searchValue, setSearchValue] = useState("@");
  const [users, setUsers] = useState<ShareableUserItem[]>([]);
  const [loading, setLoading] = useState(false);

  const cleanQuery = searchValue.replace(/^@+/, "").trim();

  useEffect(() => {
    let cancelled = false;
    const delay = cleanQuery ? 200 : 0;
    const timer = setTimeout(() => {
      setLoading(true);
      fetchShareableUsers(cleanQuery)
        .then((rows) => {
          if (!cancelled) setUsers(rows);
        })
        .catch(() => {
          if (!cancelled) setUsers([]);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, delay);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [cleanQuery]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    if (!raw || !raw.startsWith("@")) {
      setSearchValue("@" + raw.replace(/^@+/, ""));
    } else {
      setSearchValue(raw);
    }
  };

  const excludedSet = new Set(excludedUserIds);
  const availableUsers = users.filter((u) => !excludedSet.has(u.id));

  return (
    <div className="space-y-2.5">
      <div className="relative">
        <Search className="w-3.5 h-3.5 text-muted-foreground absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
        <Input
          type="text"
          value={searchValue}
          onChange={handleChange}
          placeholder={placeholder}
          className="h-8 pl-8 text-xs font-mono bg-background border-border rounded-sm"
        />
      </div>

      <div className="max-h-[30vh] overflow-y-auto space-y-1.5">
        {loading ? (
          <div className="py-5 flex items-center justify-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin text-primary" />
            <span>Buscando usuarios...</span>
          </div>
        ) : availableUsers.length === 0 ? (
          <div className="py-5 px-3 text-center text-xs text-muted-foreground border border-dashed border-border rounded-sm">
            {cleanQuery
              ? `No se encontraron usuarios para "@${cleanQuery}".`
              : "Sin sugerencias previas. Escribe después de @ para buscar usuarios."}
          </div>
        ) : (
          <>
            <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground px-0.5">
              {cleanQuery ? "Resultados de búsqueda" : "Sugeridos (compartidos previamente)"}
            </div>
            {availableUsers.map((u) => {
              const isSelected = selectedUserId === u.id;
              return (
                <div
                  key={u.id}
                  onClick={onSelectUser ? () => onSelectUser(u) : undefined}
                  className={`flex items-center justify-between gap-3 p-2.5 border rounded-sm transition-colors ${
                    onSelectUser ? "cursor-pointer" : ""
                  } ${
                    isSelected
                      ? "border-primary bg-primary/10"
                      : "border-border bg-background hover:bg-muted/40"
                  }`}
                >
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-mono font-medium text-foreground truncate">
                        @{u.username}
                      </span>
                      {u.share_count && u.share_count > 0 && !cleanQuery ? (
                        <span className="text-[10px] font-mono text-muted-foreground">
                          · {u.share_count}
                        </span>
                      ) : null}
                    </div>
                    {u.full_name && (
                      <div className="text-[11px] text-muted-foreground truncate">
                        {u.full_name}
                      </div>
                    )}
                    {renderUserExtra?.(u)}
                  </div>

                  {renderUserAction ? (
                    renderUserAction(u)
                  ) : onSelectUser && isSelected ? (
                    <Check className="w-4 h-4 text-primary shrink-0" />
                  ) : null}
                </div>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
};
