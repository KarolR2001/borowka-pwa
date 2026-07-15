import {
  Activity,
  CircleUserRound,
  ClipboardList,
  Home,
  MonitorCog,
  Settings,
  ShieldCheck
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type NavigationKey =
  "start" | "login" | "admin" | "operator" | "picker" | "settings" | "diagnostics";

export type NavigationItem = {
  key: NavigationKey;
  label: string;
  icon: LucideIcon;
};

export const navigationItems: NavigationItem[] = [
  { key: "start", label: "Start", icon: Home },
  { key: "login", label: "Logowanie", icon: ShieldCheck },
  { key: "admin", label: "Administrator", icon: MonitorCog },
  { key: "operator", label: "Operator", icon: ClipboardList },
  { key: "picker", label: "Zbieracz", icon: CircleUserRound },
  { key: "settings", label: "Ustawienia", icon: Settings },
  { key: "diagnostics", label: "Diagnostyka", icon: Activity }
];
