import {
  CircleUserRound,
  ClipboardList,
  LayoutDashboard,
  UserRound,
  type LucideIcon
} from "lucide-react";

import type { UserRole } from "../domain/identity";

export type NavigationKey = "admin" | "operator" | "picker" | "account";

export type NavigationItem = {
  key: NavigationKey;
  label: string;
  icon: LucideIcon;
};

const accountItem = {
  key: "account",
  label: "Konto",
  icon: UserRound
} satisfies NavigationItem;

const navigationByRole: Record<UserRole, readonly NavigationItem[]> = {
  ADMIN: [{ key: "admin", label: "Pulpit", icon: LayoutDashboard }, accountItem],
  OPERATOR: [{ key: "operator", label: "Zbiory", icon: ClipboardList }, accountItem],
  PICKER: [{ key: "picker", label: "Moje dane", icon: CircleUserRound }, accountItem]
};

const homeByRole: Record<UserRole, NavigationKey> = {
  ADMIN: "admin",
  OPERATOR: "operator",
  PICKER: "picker"
};

export function navigationItemsForRole(role: UserRole): readonly NavigationItem[] {
  return navigationByRole[role];
}

export function homeNavigationForRole(role: UserRole): NavigationKey {
  return homeByRole[role];
}
