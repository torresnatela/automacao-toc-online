"use client";

import { LogOut } from "lucide-react";
import { Avatar, initialsFrom } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { signOut } from "@/app/login/actions";

// Rótulos de papel locais — evita acoplar o shell ao @toc/core/auth (em refactor).
const ROLE_LABELS: Record<string, string> = {
  admin: "Administrador",
  operator: "Operador",
  viewer: "Leitor",
};

function UserMenu({ email, role }: { email: string; role: string }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex items-center gap-2 rounded-full p-1 pr-2 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <Avatar>{initialsFrom(email)}</Avatar>
        <span className="hidden text-left sm:block">
          <span className="block max-w-40 truncate text-sm font-medium leading-tight text-foreground">
            {email}
          </span>
          <span className="block text-xs leading-tight text-muted-foreground">
            {ROLE_LABELS[role] ?? role}
          </span>
        </span>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuLabel>{email}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <form action={signOut}>
          <DropdownMenuItem asChild>
            <button type="submit" className="w-full">
              <LogOut /> Sair
            </button>
          </DropdownMenuItem>
        </form>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export { UserMenu };
