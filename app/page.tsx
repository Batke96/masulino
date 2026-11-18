"use client";

import { useState, useEffect, useRef, type CSSProperties, type ReactElement } from "react";
import { LayoutDashboard, Sparkles, BookOpen, CalendarDays, Users, Ticket, Cake, ChartNoAxesCombined, Megaphone, Coffee, Globe, CloudRain, Sun, CloudSun, Cloud, Bell, Search, ChevronDown, Plus, Settings2, Clock3, Check, CheckCheck, CircleHelp, X, Send, ShieldCheck, CircleCheck, History, Pause, Play, RotateCcw, MapPin, ExternalLink, ScanLine, CreditCard, Heart, Menu, SlidersHorizontal, CalendarCheck, Info, Mail, Smartphone, Target, TrendingUp, Pencil, GripVertical, Command as CommandIcon, PanelLeftClose, PanelLeftOpen, LogOut, type LucideIcon } from "lucide-react";
import { Dialog, DialogContent, DialogTitle, DialogDescription, DialogClose } from "@/components/ui/dialog";
import { JellyButton } from "@/components/ui/jelly-button";
import { Sheet, SheetContent, SheetTitle, SheetDescription, SheetClose } from "@/components/ui/sheet";
import { Sidebar, SidebarProvider, SidebarContent, SidebarHeader, SidebarFooter, SidebarTrigger, useSidebar } from "@/components/ui/sidebar";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { PeriodToggle } from "@/components/period-toggle";
import { GlideSelect } from "@/components/ui/glide-select";
import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from "@/components/ui/command";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Switch } from "@/components/ui/switch";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";
import {
  cancelBooking,
  createBooking,
  enableWorkspaceFromEnv,
  fetchBootstrap,
  fetchPackages,
  fetchReports,
  fetchReservationSpan,
  fetchSectionBookings,
  fetchTeamLive,
  isWorkspaceMode,
  newIdempotencyKey,
  type BookingViewModel,
  type FamilyRow,
  type PackageOption,
  type TeamLive,
} from "@/lib/workspace/client";
import { PosDashboard } from "@/components/reports/pos-dashboard";
import { StaffAccess, useStaffIdentity, type StaffIdentity } from "@/app/staff-access";
import { appVisible, viewVisible } from "@/lib/workspace/capabilities";
import { shownBookings } from "@/lib/workspace/shown-bookings";
import { TableFloor } from "@/app/table-floor";
import { OccupancyPanel } from "@/components/booking/occupancy-panel";
import { PersonalWorkspace } from "@/components/personal/personal-workspace";
import type { SpanBooking } from "@/lib/reports/booking-window";
import { KpiCard } from "@/components/ui/kpi-card";
import { BookingSchedule, type ScheduleRow } from "@/app/booking-lists";
import { DataTable, type DataColumn } from "@/components/data-table";
import { visitSortKey } from "@/lib/tables/sort";
import { addDays, browserLocalDate, formatDayLabel, periodDates, periodDatesUnion, periodLabel, type BookingPeriod } from "@/lib/booking/period";
import { deltaAgainstPrevious, historyCaption, historyDates, seriesForDates } from "@/lib/booking/kpi-series";

type Scenario = "rain" | "sun" | "full";
type Suggestion = "weather" | "return" | "team";
type AgentState = "pending" | "planned" | "snoozed";
type AppId = "bookings" | "tickets" | "families" | "team" | "reports" | "campaigns" | "bistro" | "portal" | "it";
type View = "today" | "agents" | "knowledge" | "concept" | AppId;
type ChatMessage = { role: "user" | "assistant"; text: string; kind?: string };
type AppTile = { id: AppId; name: string; description: string; icon: LucideIcon; color: string; meta: string };
const apps: AppTile[] = [
  { id:"bookings", name:"Buchungen", description:"Besuche & Reservierungen", icon:CalendarDays, color:"violet", meta:"24 heute" },
  { id:"team", name:"Team & Schichten", description:"Gemeinsam gut geplant", icon:Users, color:"green", meta:"6 im Einsatz" },
  { id:"reports", name:"Auswertungen", description:"Zahlen mit Überblick", icon:ChartNoAxesCombined, color:"amber", meta:"September 2026" },
];
const liveTileIds = new Set<AppId>(["bookings", "team", "reports"]);

function isAppId(value: unknown): value is AppId {
  return apps.some((app) => app.id === value);
}

function orderedAppIds(capabilities: StaffIdentity["capabilities"] | null): AppId[] {
  const visible = apps.filter((app) => appVisible(app.id, capabilities));
  return [...visible.filter((app) => app.id === "it"), ...visible.filter((app) => app.id !== "it")].map((app) => app.id);
}

function defaultPinnedIds(capabilities: StaffIdentity["capabilities"] | null): AppId[] {
  return orderedAppIds(capabilities).slice(0, 6);
}

function pinStorageKey(email: string): string {
  return `masulino.pinned-apps:${email}`;
}

function menuOrderKey(email: string): string {
  return `masulino.menu-order:${email}`;
}

function readMenuOrder(email: string, capabilities: StaffIdentity["capabilities"] | null): AppId[] {
  const defaults = orderedAppIds(capabilities);
  if (typeof window === "undefined") return defaults;
  try {
    const raw = window.localStorage.getItem(menuOrderKey(email));
    if (!raw) return defaults;
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return defaults;
    const allowed = new Set(defaults);
    const kept = parsed.filter((id): id is AppId => isAppId(id) && allowed.has(id));
    const missing = defaults.filter((id) => !kept.includes(id));
    return [...kept, ...missing];
  } catch {
    return defaults;
  }
}

function writeMenuOrder(email: string, ids: AppId[]): void {
  window.localStorage.setItem(menuOrderKey(email), JSON.stringify(ids));
}

function readPinnedIds(email: string, capabilities: StaffIdentity["capabilities"] | null): AppId[] {
  const allowed = new Set(orderedAppIds(capabilities));
  if (typeof window === "undefined") return defaultPinnedIds(capabilities);
  try {
    const raw = window.localStorage.getItem(pinStorageKey(email));
    if (!raw) return defaultPinnedIds(capabilities);
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return defaultPinnedIds(capabilities);
    return parsed.filter((id): id is AppId => isAppId(id) && allowed.has(id));
  } catch {
    return defaultPinnedIds(capabilities);
  }
}

function monthLabel(localDate: string): string {
  const [year, month] = localDate.split("-").map(Number);
  if (!year || !month) return "—";
  return new Intl.DateTimeFormat("de-DE", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(year, month - 1, 1)));
}

function scheduleFrom(row: { id: string; time: string; name: string; detail: string; type: string; date?: string; tables?: string[]; childrenCount?: number; adultCount?: number; version?: number }, checked: boolean): ScheduleRow {
  const children = typeof row.childrenCount === "number" ? row.childrenCount : Number(/(\d+)\s+Kinder/.exec(row.detail)?.[1] ?? 0);
  const adults = typeof row.adultCount === "number" ? row.adultCount : Number(/(\d+)\s+Erwachsene/.exec(row.detail)?.[1] ?? 0);
  const tableLabel = row.tables && row.tables.length > 0 ? row.tables.join(", ") : (row.detail.split("·")[0]?.trim() || "—");
  return {
    id: row.id,
    kind: row.type === "Geburtstag" ? "geburtstag" : "kita",
    date: row.date ?? "",
    time: row.time,
    name: row.name,
    children,
    adults,
    tableLabel,
    checkedIn: checked,
    version: row.version,
  };
}

function onDutyCount(team: TeamLive, localDate: string): number {
  const shifts = team.week?.published?.shifts ?? [];
  const people = new Set<string>();
  for (const shift of shifts) {
    if (shift.localDate !== localDate) continue;
    people.add(shift.displayName ?? shift.id);
  }
  return people.size;
}
const scenarios = {
  rain: { title:"Draußen Regen.\nDrinnen Möglichkeiten.", description:"Morgen wird’s nass. Dein Wetter-Agent hat eine gute Idee für den ruhigen Vormittag.", temperature:"12°", rain:"90 %", occupancy:58, opportunity:"18–26", label:"Regen", icon:CloudRain, agentTitle:"Regen? Ein guter Anlass.", agentCopy:"184 passende Familien. Freie Plätze morgen Vormittag. Eine Einladung ist vorbereitet.", campaign:"Regen draußen. Spielzeit drinnen.", forecast:[14,12,15,16], series:[24,36,48,58,55,72,88,92,76,42] },
  sun: { title:"Sonne im Freien.\nIdeen für drinnen.", description:"Morgen bleibt es ruhig. Lade Familien gezielt zum entspannten Spielen am späten Nachmittag ein.", temperature:"24°", rain:"10 %", occupancy:32, opportunity:"8–14", label:"Sonne", icon:Sun, agentTitle:"Ein ruhiger Nachmittag wartet.", agentCopy:"96 passende Familien. Ein kleiner Club-Vorteil für morgen ab 16 Uhr ist vorbereitet.", campaign:"Euer entspannter Spielnachmittag.", forecast:[22,24,23,21], series:[18,22,27,34,35,32,30,26,24,15] },
  full: { title:"Volles Haus.\nAlles gut vorbereitet.", description:"Morgen erwarten wir viele Gäste. Dein Agent pausiert Werbung und lenkt den Blick auf dein Team.", temperature:"11°", rain:"95 %", occupancy:96, opportunity:"0", label:"Volles Haus", icon:CloudRain, agentTitle:"Werbung pausiert. Kapazität schützen.", agentCopy:"96 % erwartete Auslastung. Keine zusätzliche Kampagne; Warteliste und Besetzung prüfen.", campaign:"Kapazität zuerst", forecast:[14,11,13,15], series:[58,72,85,96,98,96,94,90,82,60] },
};
const reservations = [
  {id:"M-2401",time:"10:00",name:"Kita Sonnenschein",detail:"Gruppenbesuch · 18 Kinder, 3 Erwachsene",type:"Gruppe",color:"green"},
  {id:"M-2402",time:"11:30",name:"Geburtstag · Familie Weber",detail:"Dschungelraum · 8 Kinder, 4 Erwachsene",type:"Geburtstag",color:"violet"},
  {id:"M-2403",time:"14:00",name:"Geburtstag · Familie Yilmaz",detail:"Regenbogenraum · 10 Kinder, 4 Erwachsene",type:"Geburtstag",color:"pink"},
  {id:"M-2404",time:"15:00",name:"Geburtstag · Familie Fischer",detail:"Dschungelraum · 7 Kinder, 3 Erwachsene",type:"Geburtstag",color:"blue"},
];
const knowledge = [
  {title:"Geburtstage & Pakete",text:"Im Demo-Angebot enthalten: 3 Stunden Spielzeit, ein dekorierter Tisch, Wasser und ein Kindermenü. Eine erwachsene Begleitperson bleibt vor Ort.",icon:Cake},
  {title:"Club & Treuepunkte",text:"Demo-Regel: 1 Punkt je Euro Eintritt. Ab 100 Punkten gibt es einen 5-€-Vorteil. Bistro-Umsatz und eingelöste Vorteile zählen nicht mit.",icon:Heart},
  {title:"Wetter & Kapazität",text:"Eine Kampagne wird nur vorgeschlagen, wenn nach erwarteten spontanen Besuchen noch Kapazität frei ist. Ab 85 % erwarteter Auslastung bleiben zusätzliche Einladungen aus.",icon:CloudRain},
  {title:"Familien wieder einladen",text:"Demo-Segment: mindestens 60 Tage ohne Besuch, Kontaktfreigabe vorhanden, keine Nachricht in den letzten 14 Tagen und keine bevorstehende Buchung.",icon:Users},
];

function occupancyFallback(rows: ReadonlyArray<{ id: string; time?: string; name?: string; detail?: string; type?: string; status?: string; packageName?: string; childrenCount?: number; adultCount?: number; tables?: string[] }>, date: string): SpanBooking[] {
  return rows.map((row) => ({
    id: row.id,
    localDate: date,
    localTime: row.time ?? "",
    status: row.status ?? "confirmed",
    organizerName: row.name ?? "",
    packageName: row.packageName ?? row.type ?? "",
    party: row.type === "Geburtstag",
    childrenCount: typeof row.childrenCount === "number" ? row.childrenCount : Number(/(\d+)\s+Kinder/.exec(row.detail ?? "")?.[1] ?? 0),
    adultCount: typeof row.adultCount === "number" ? row.adultCount : Number(/(\d+)\s+Erwachsene/.exec(row.detail ?? "")?.[1] ?? 0),
    tables: row.tables ?? [],
    bookedValueMinor: 0,
    currency: "EUR",
  }))
}
function Pill({children, tone="neutral"}:{children:React.ReactNode;tone?:string}){return <span className={"pill "+tone}>{children}</span>}
type FamilyListRow = { n: string; t: string; p: number; s: boolean; l: boolean };
const familyColumns: DataColumn<FamilyListRow>[] = [
  { id: "name", label: "Name", kind: "text", raw: (row) => row.n, text: (row) => row.n, render: (row) => <strong>{row.n}</strong> },
  { id: "visit", label: "Letzter Besuch", kind: "number", raw: (row) => visitSortKey(row.t), text: (row) => row.t },
  { id: "points", label: "Club-Punkte", kind: "number", raw: (row) => row.p, text: (row) => String(row.p) },
  { id: "consent", label: "Kontaktfreigabe", kind: "boolean", raw: (row) => row.s, text: (row) => (row.s ? "Freigegeben" : "Keine Freigabe"), render: (row) => <Pill tone={row.s ? "green" : "neutral"}>{row.s ? "Freigegeben" : "Keine Freigabe"}</Pill> },
];
function IconTile({icon:Icon,color="orange",small=false}:{icon:LucideIcon;color?:string;small?:boolean}){return <span className={"icon-tile "+color+(small?" small":"")}><Icon size={small?18:23} strokeWidth={1.8}/></span>}
function Choice({value,onChange,items,label}:{value:string;onChange:(v:string)=>void;items:{value:string;label:string}[];label:string}){return <GlideSelect options={items} value={value} onChange={onChange} showTags={false} ariaLabel={label} align="right"/>}
function CloseDialog(){return <DialogClose className="icon-button modal-close" aria-label="Schließen"><X size={20}/></DialogClose>}

function SidebarTip({label,enabled,children}:{label:string;enabled:boolean;children:ReactElement}){
  if(!enabled) return children;
  return <Tooltip><TooltipTrigger asChild>{children}</TooltipTrigger><TooltipContent side="right" sideOffset={8}>{label}</TooltipContent></Tooltip>;
}
function SidebarShowButton(){
  const {mode,isMobile,showSidebar}=useSidebar();
  if(mode!=="hidden"||isMobile) return null;
  return <Tooltip><TooltipTrigger asChild><button id="sidebar-show" type="button" className="icon-button sidebar-show" aria-label="Navigation einblenden" onClick={showSidebar}><PanelLeftOpen size={20} strokeWidth={1.8}/></button></TooltipTrigger><TooltipContent side="bottom" sideOffset={8}>Navigation einblenden</TooltipContent></Tooltip>;
}
function Navigation({view,onNavigate,pending,staff}:{view:View;onNavigate:(view:View)=>void;pending:number;staff:StaffIdentity|null}){
  const {setOpenMobile,mode,isMobile,hideSidebar} = useSidebar();
  const iconMode=mode==="icon";
  const go=(v:View)=>{onNavigate(v);setOpenMobile(false)};
  const orderKey=staff?.email??"demo";
  const capabilityKey=staff?[staff.capabilities.bookings,staff.capabilities.families,staff.capabilities.team,staff.capabilities.reports,staff.capabilities.campaigns,staff.capabilities.portal,staff.capabilities.it].join(","):"demo";
  const [menuOrder,setMenuOrder]=useState<AppId[]>(()=>orderedAppIds(null));
  const [editingMenu,setEditingMenu]=useState(false);
  const [dropIndex,setDropIndex]=useState<number|null>(null);
  const dragFrom=useRef<number|null>(null);
  useEffect(()=>{
    setMenuOrder(readMenuOrder(orderKey, staff?.capabilities??null));
    setEditingMenu(false);
  },[orderKey,capabilityKey]);
  useEffect(()=>{
    if(mode==="expanded") return;
    setEditingMenu(false);
    setDropIndex(null);
  },[mode]);
  const primary=([{id:"today",name:"Übersicht",icon:LayoutDashboard}] as {id:View;name:string;icon:LucideIcon}[]).filter(item=>viewVisible(item.id, staff?.capabilities??null));
  const menuApps=menuOrder.map((id)=>apps.find((app)=>app.id===id)).filter((app): app is AppTile => Boolean(app));
  function moveApp(from:number,to:number){
    if(from===to||from<0||to<0||from>=menuOrder.length||to>=menuOrder.length) return;
    const next=[...menuOrder];
    const [moved]=next.splice(from,1);
    if(!moved) return;
    next.splice(to,0,moved);
    setMenuOrder(next);
    writeMenuOrder(orderKey, next);
  }
  const profileName=staff?.name??"Peed";
  const profileRole=staff?staff.roleLabel:"Betriebsleitung · Demo";
  const locationName=staff?staff.locationName:"Dein Spielraum";
  const tenantName=staff?staff.tenantName:"Masulino · Hauptstandort";
  return <Sidebar className="side-navigation"><SidebarHeader className="brand-area"><button className="brand" onClick={()=>go("today")} aria-label="Masulino Startseite"><span className="brand-mark">m</span><span className="brand-word">masulino<span className="brand-dot">.</span></span></button>{!isMobile&&<Tooltip><TooltipTrigger asChild><button id="sidebar-hide" type="button" className="icon-button sidebar-hide" aria-label="Navigation ausblenden" onClick={hideSidebar}><PanelLeftClose size={19} strokeWidth={1.8}/></button></TooltipTrigger><TooltipContent side="right" sideOffset={8}>Navigation ausblenden</TooltipContent></Tooltip>}</SidebarHeader>
    <SidebarContent><div className="nav-label">ARBEITSRAUM</div><nav aria-label="Hauptnavigation">{primary.map(({id,name,icon:Icon})=>{const label=id==="agents"&&pending>0?`${name}, ${pending} Hinweise`:name;return <SidebarTip key={id} label={label} enabled={iconMode}><button className={"nav-item "+(view===id?"active":"")} aria-label={label} aria-current={view===id?"page":undefined} onClick={()=>go(id)}><Icon size={19} strokeWidth={1.8}/><span>{name}</span>{id==="agents"&&pending>0&&<span className="nav-count">{pending}</span>}</button></SidebarTip>})}</nav>
    {menuApps.length>0&&<><div className="nav-label second apps-label"><span>MEINE APPS</span><button type="button" className="nav-edit" aria-pressed={editingMenu} onClick={()=>setEditingMenu((value)=>!value)}>{editingMenu?"Fertig":"Bearbeiten"}</button></div><nav id="meine-apps" aria-label={editingMenu?"Meine Apps sortieren":"Meine Apps"}>{editingMenu&&<p id="apps-sort-hint" className="sr-only">Nur die Reihenfolge ändert sich. Eintrag ziehen oder mit den Pfeiltasten verschieben.</p>}{menuApps.map(({id,name,icon:Icon},index)=><SidebarTip key={id} label={name} enabled={iconMode}><button type="button" className={"nav-item"+(view===id?" active":"")+(editingMenu?" sorting":"")+(dropIndex===index?" drop-target":"")} aria-label={name} aria-current={!editingMenu&&view===id?"page":undefined} aria-describedby={editingMenu?"apps-sort-hint":undefined} draggable={editingMenu} onClick={()=>{if(!editingMenu) go(id)}} onKeyDown={(event)=>{if(!editingMenu) return; if(event.key==="ArrowUp"&&index>0){event.preventDefault();moveApp(index,index-1)} if(event.key==="ArrowDown"&&index<menuApps.length-1){event.preventDefault();moveApp(index,index+1)}}} onDragStart={(event)=>{dragFrom.current=index; event.dataTransfer.effectAllowed="move"; event.dataTransfer.setData("text/plain", id)}} onDragOver={(event)=>{if(!editingMenu||dragFrom.current===null) return; event.preventDefault(); event.dataTransfer.dropEffect="move"; if(dropIndex!==index) setDropIndex(index)}} onDrop={(event)=>{event.preventDefault(); const from=dragFrom.current; dragFrom.current=null; setDropIndex(null); if(from!==null) moveApp(from,index)}} onDragEnd={()=>{dragFrom.current=null; setDropIndex(null)}}><Icon size={18} strokeWidth={1.8}/><span>{name}</span>{editingMenu&&<GripVertical className="nav-grip" size={16} strokeWidth={1.8} aria-hidden="true"/>}</button></SidebarTip>)}</nav></>}
    </SidebarContent>
    <SidebarFooter className="side-footer"><SidebarTip label={`${profileName}. ${profileRole}`} enabled={iconMode}><div className="profile"><span className="avatar">{profileName.trim().charAt(0).toUpperCase()||"P"}</span><div><strong>{profileName}</strong><small>{profileRole}</small></div></div></SidebarTip><SidebarTip label={`${locationName}, ${tenantName}`} enabled={iconMode}><div className="workspace-name"><span className="workspace-icon"><MapPin size={17} strokeWidth={1.8}/></span><div>{locationName}<small>{tenantName}</small></div></div></SidebarTip>{staff&&<SidebarTip label="Abmelden" enabled={iconMode}><button className="nav-item" type="button" aria-label="Abmelden" onClick={staff.signOut}><LogOut className="nav-icon-only" size={18} strokeWidth={1.8}/><span>Abmelden</span></button></SidebarTip>}</SidebarFooter>
  </Sidebar>
}

function minuteLabel(value: number): string {
  const hours = Math.floor(value / 60);
  const minutes = value % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

const weekdayShort = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];

function LiveTeamPanel({ team }: { team: TeamLive | null | undefined }) {
  if (team === undefined) return <div className="empty-state surface"><h3>Dienstplan wird geladen.</h3></div>;
  if (!team) return <div className="empty-state surface"><h3>Dienstplan ist nicht erreichbar.</h3><p>Beispielnamen werden in der angemeldeten Ansicht nicht gezeigt.</p></div>;
  const shifts = team.week?.published?.shifts ?? [];
  const warnings = team.week?.published?.warnings ?? [];
  return <>
    <div className="section-head"><h2>Dienstplan</h2><Pill>{team.week?.published ? "Veröffentlicht" : "Kein veröffentlichter Plan"}</Pill></div>
    {shifts.length === 0 ? <div className="empty-state surface"><h3>Keine veröffentlichten Schichten</h3><p>Woche ab {team.weekStartsOn}. Ein Vorschlag ist keine Zusage und keine Nachricht.</p></div> : <div className="team-grid">{shifts.map((shift) => <article className="surface team-person" key={shift.id}><span className="avatar blue">{(shift.displayName ?? "?").slice(0, 1)}</span><h3>{shift.displayName ?? "Ohne Namen"}</h3><p>{shift.localDate}</p><Pill>{minuteLabel(shift.startMinute)}–{minuteLabel(shift.endMinute)}</Pill></article>)}</div>}
    {team.availability.length > 0 && <section className="surface"><div className="section-head"><h2>Verfügbarkeit</h2><Pill>{team.availabilityScope === "self" ? "Nur eigene Zeiten" : "Betrieb"}</Pill></div>{team.availability.map((person, index) => <p key={index}><strong>{person.displayName ?? "Ohne Namen"}</strong>{" "}{person.windows.map((window) => `${weekdayShort[window.weekday] ?? ""} ${minuteLabel(window.startMinute)}–${minuteLabel(window.endMinute)}`).join(" · ") || "Keine Fenster"}</p>)}</section>}
    {team.punches.length > 0 && <section className="surface"><h2>Zeitbuchungen</h2>{team.punches.map((punch) => <p key={punch.id}>{punch.displayName ?? "Ohne Namen"} · {punch.localDate} {punch.localTime} · {punch.kind === "in" ? "Kommen" : "Gehen"}</p>)}</section>}
    {warnings.length > 0 && <div className="callout amber"><div><strong>Hinweise aus den Fixture-Regeln</strong><p>Das ist keine Aussage zum Arbeitszeitgesetz und keine Schichtzusage.</p></div></div>}
    {(team.week?.draftCount ?? 0) > 0 && <p className="fine-print">Es liegt ein Entwurf mit {team.week?.draftCount} Schichten. Er ist nicht veröffentlicht.</p>}
    <p className="fine-print">Das Demo-Postfach ändert diesen Plan nicht.</p>
  </>;
}

function Workspace(){
 const staff=useStaffIdentity();
 const [view,setView]=useState<View>("today");
 const [scenario,setScenario]=useState<Scenario>("rain");
 const [states,setStates]=useState<Record<Suggestion,AgentState>>({weather:"pending",return:"pending",team:"pending"});
 const [enabled,setEnabled]=useState<Record<Suggestion,boolean>>({weather:true,return:true,team:true});
 const [campaign,setCampaign]=useState<Suggestion|null>(null);
 const [channel,setChannel]=useState("email");
 const [offer,setOffer]=useState("coffee");
 const [subject,setSubject]=useState("");
 const [message,setMessage]=useState("");
 const [sendTime,setSendTime]=useState("today");
 const [review,setReview]=useState(false);
 const [searchOpen,setSearchOpen]=useState(false);
 const [query,setQuery]=useState("");
 const [chatOpen,setChatOpen]=useState(false);
 const [chatInput,setChatInput]=useState("");
 const [messages,setMessages]=useState<ChatMessage[]>([]);
 const [thinking,setThinking]=useState(false);
 const [checkedIn,setCheckedIn]=useState<string[]>([]);
 const [hiddenBookings,setHiddenBookings]=useState<string[]>([]);
 const [birthdayPeriod,setBirthdayPeriod]=useState<BookingPeriod>("today");
 const [spanBookings,setSpanBookings]=useState<SpanBooking[]|null>(null);
 const [occupancyState,setOccupancyState]=useState<"loading"|"ready"|"failed">("loading");
 const [visitPeriod,setVisitPeriod]=useState<BookingPeriod>("today");
 const [browserDate,setBrowserDate]=useState<string|null>(null);
 const [rangeBookings,setRangeBookings]=useState<Array<BookingViewModel&{date:string}>|null>(null);
 const [rangeFailed,setRangeFailed]=useState(false);
 const [bookingRevision,setBookingRevision]=useState(0);
 const [familyFilter,setFamilyFilter]=useState("all");
 const [agentFilter,setAgentFilter]=useState("pending");
 const [rulesOpen,setRulesOpen]=useState(false);
 const [logs,setLogs]=useState<{title:string;detail:string}[]>([]);
 const [selectedArticle,setSelectedArticle]=useState<number|null>(null);
 const [detailBooking,setDetailBooking]=useState<string|null>(null);
 const [newBooking,setNewBooking]=useState(false);
 const [newName,setNewName]=useState("");
 const [newCount,setNewCount]=useState("4");
 const [extraBookings,setExtraBookings]=useState<typeof reservations>([]);
 const [liveBookings,setLiveBookings]=useState<BookingViewModel[]|null>(null);
 const [priorDays,setPriorDays]=useState<Array<{date:string;type:string}>|null>(null);
 const [liveFamilies,setLiveFamilies]=useState<FamilyRow[]|null>(null);
 const [livePackages,setLivePackages]=useState<PackageOption[]|null>(null);
 const [liveReport,setLiveReport]=useState<{bookedValueMinor:number;currency:string;collectedPayments:{connected:boolean}}|null>(null);
 const [liveNotices,setLiveNotices]=useState<Array<{id:string;title:string;status:string}>|null>(null);
 const [liveAudienceCount,setLiveAudienceCount]=useState<number|null>(null);
 const [liveTeam,setLiveTeam]=useState<TeamLive|null|undefined>(undefined);
 const [venueDate,setVenueDate]=useState<string|null>(null);
 const [bookingsFailed,setBookingsFailed]=useState(false);
 const [familiesFailed,setFamiliesFailed]=useState(false);
 const [workspaceFailed,setWorkspaceFailed]=useState(false);
 const pinKey=staff?.email??"demo";
 const capabilityKey=staff?[staff.capabilities.bookings,staff.capabilities.families,staff.capabilities.team,staff.capabilities.reports,staff.capabilities.campaigns,staff.capabilities.portal,staff.capabilities.it].join(","):"demo";
 const [pinnedIds,setPinnedIds]=useState<AppId[]>(()=>defaultPinnedIds(null));
 const [pinDraft,setPinDraft]=useState<AppId[]>([]);
 const [editingPins,setEditingPins]=useState(false);
 const [newEmail,setNewEmail]=useState("");
 const [newPhone,setNewPhone]=useState("");
 const [workspaceReady,setWorkspaceReady]=useState(false);
 const [bookingBusy,setBookingBusy]=useState(false);
 const [bookingAlternatives,setBookingAlternatives]=useState<string[]>([]);
 const [idempotencyKey,setIdempotencyKey]=useState("");
 const [selectedPackageId,setSelectedPackageId]=useState("");
 const [sale,setSale]=useState(0);
 const [cart,setCart]=useState(0);
 const [reminder,setReminder]=useState(false);
 const bottomRef=useRef<HTMLDivElement>(null);
 const d=scenarios[scenario];
 const pending=(Object.keys(states) as Suggestion[]).filter(k=>states[k]==="pending"&&enabled[k]).length;
 const fixtureBookings=[...reservations,...extraBookings];
 const liveMode=isWorkspaceMode();
 const shown=shownBookings({liveMode, live:liveBookings, fixtures:fixtureBookings, hiddenIds:hiddenBookings});
 const allBookings=shown.rows;
 const canSeeBookings=!staff||staff.capabilities.bookings;
 const bookingsLoading=Boolean(canSeeBookings&&shown.loading&&!workspaceFailed&&!bookingsFailed);
 const dashboardBookings=(!canSeeBookings||bookingsLoading||(liveMode&&(workspaceFailed||bookingsFailed)))?[]:shown.rows;
 const dashboardBirthdays=dashboardBookings.filter((row)=>row.type==="Geburtstag").length;
 const anchorDate=venueDate??browserDate;
 const historyReady=!workspaceReady||priorDays!==null;
 const historyRows=anchorDate?[...(priorDays??[]),...dashboardBookings.map((row)=>({date:anchorDate,type:row.type}))]:[];
 const bookingSeries=canSeeBookings&&anchorDate&&historyReady&&!bookingsLoading?seriesForDates(historyDates(anchorDate),historyRows,false):undefined;
 const birthdaySeries=canSeeBookings&&anchorDate&&historyReady&&!bookingsLoading?seriesForDates(historyDates(anchorDate),historyRows,true):undefined;
 const occupancyRows=liveMode
  ?(spanBookings??[]).filter((row)=>!hiddenBookings.includes(row.id))
  :occupancyFallback(dashboardBookings, anchorDate??"");
 const bookingDayLabel=liveMode?"Heute":"Dienstag, 29. September";
 const agentTitles={weather:d.agentTitle,return:"Zeit für ein Wiedersehen.",team:scenario==="full"?"Morgen braucht Verstärkung.":"Samstag wird’s lebhaft."};
 function navigate(next:View){setView(next);setSearchOpen(false);if(typeof window!=="undefined"){const url=new URL(window.location.href);if(next==="it")url.hash="it";else if(url.hash==="#it"||url.searchParams.get("app")==="it"){url.hash="";url.searchParams.delete("app");}window.history.replaceState(null,"",`${url.pathname}${url.search}${url.hash}`);}window.scrollTo({top:0,behavior:"instant"});}
 function changeScenario(next:Scenario){setScenario(next);setStates(s=>({...s,weather:"pending",team:"pending"}));toast("Szenario: "+scenarios[next].label,{description:"Wetter, Auslastung und Empfehlungen wurden neu simuliert."})}
 function openCampaign(kind:Suggestion){setCampaign(kind);setReview(false);setChannel("email");setOffer(kind==="return"?"points":"coffee");setSendTime("today");setSubject(kind==="return"?"Lange nicht gespielt? Wir vermissen euch!":d.campaign);setMessage(kind==="return"?"Es ist eine Weile her! Wir würden uns freuen, euch wieder bei Masulino zu sehen. Sucht euch einen ruhigen Spieltermin aus und sammelt bei eurem nächsten Besuch doppelte Club-Punkte.":scenario==="sun"?"Lust auf einen entspannten Spielnachmittag? Morgen ab 16 Uhr ist viel Platz zum Toben. Zu eurem gebuchten Kinderticket laden wir eine Begleitperson auf einen Kaffee ein.":"Morgen regnet es? Bei uns regnet’s nur Spielideen. Kommt zwischen 9 und 12 Uhr vorbei. Zu eurem gebuchten Kinderticket laden wir eine Begleitperson auf einen Kaffee ein.")}
 function snooze(kind:Suggestion){setStates(s=>({...s,[kind]:"snoozed"}));setLogs(l=>[{title:agentTitles[kind]+" · zurückgestellt",detail:"Erinnerung für morgen, 09:00 · nur in dieser Demo"},...l]);toast("Für morgen zurückgestellt",{action:{label:"Rückgängig",onClick:()=>setStates(s=>({...s,[kind]:"pending"}))}})}
 function planCampaign(){if(!campaign)return;const kind=campaign;setStates(s=>({...s,[kind]:"planned"}));setLogs(l=>[{title:kind==="team"?"Schichtvorschlag vorgemerkt":subject,detail:(kind==="team"?"Besetzung zur Prüfung vorgemerkt":(channel==="email"?"E-Mail":"Push")+" · "+recipients+" Kontakte · "+(sendTime==="today"?"heute, 17:00":"morgen, 08:00"))+" · von Peed in der Demo freigegeben"},...l]);setCampaign(null);toast(kind==="team"?"Schichtvorschlag vorgemerkt":"Demo-Kampagne eingeplant",{description:"Es wurde nichts versendet.",action:{label:"Rückgängig",onClick:()=>{setStates(s=>({...s,[kind]:"pending"}));setLogs(l=>[{title:"Freigabe zurückgenommen",detail:agentTitles[kind]+" · wieder zur Prüfung"},...l])}}})}
 function ask(question:string){if(!question.trim()||thinking)return;setChatOpen(true);setChatInput("");setMessages(m=>[...m,{role:"user",text:question.trim()}]);setThinking(true);const q=question.toLowerCase();let answer:ChatMessage;
  if(/wetter|morgen|regen|auslast|sonn|voll/.test(q)){answer={role:"assistant",kind:"weather",text:scenario==="full"?"Morgen liegt die erwartete Auslastung bei 96 %. Ich würde keine zusätzliche Kampagne starten. Priorität haben jetzt eine passende Besetzung und die Warteliste.":"Morgen sind "+d.rain+" Regenwahrscheinlichkeit simuliert. Im empfohlenen Zeitfenster erwarten wir "+d.occupancy+" % Auslastung einschließlich spontaner Besuche. "+(scenario==="rain"?"Der Nachmittag erreicht dagegen 92 %: Die Einladung gilt deshalb nur von 9 bis 12 Uhr.":"Ab 16 Uhr ist genug Platz für eine kleine Club-Aktion.")};}
  else if(/famil|lange|fehlt|wieder|gast|gäste|kunden/.test(q)){answer={role:"assistant",kind:"return",text:"78 Familien waren seit mindestens 60 Tagen nicht mehr hier. Nach 18 fehlenden Kontaktfreigaben, 9 Kontakten mit einer kürzlichen Nachricht und 4 bevorstehenden Buchungen bleiben 47 passende Familien. Die Zielgruppen für Wetter und Wiederbesuch sind in dieser Demo überschneidungsfrei."};}
  else if(/team|schicht|samstag|personal/.test(q)){answer={role:"assistant",kind:"team",text:scenario==="full"?"Für morgen erwarten wir 96 % Auslastung. Von 9 bis 12 Uhr sollte eine weitere Person am Check-in helfen. Alex ist im Demo-Schichtplan verfügbar; die Zusage steht noch aus.":"Für Samstag sind 7 Mitarbeitende eingeplant, 8 wären laut Demo-Bedarfsplanung sinnvoll. Der Engpass liegt am Check-in von 13 bis 15 Uhr. Alex ist als verfügbar markiert; eine Zusage liegt noch nicht vor."};}
  else if(/geburt|feier|paket|buchung/.test(q)){answer={role:"assistant",kind:"bookings",text:"Heute stehen 3 Geburtstagsfeiern an: 11:30 Uhr im Dschungelraum, 14:00 Uhr im Regenbogenraum und 15:00 Uhr wieder im Dschungelraum. Das Demo-Paket enthält 3 Stunden Spielzeit, Wasser und ein Kindermenü."};}
  else if(/punkt|club|loyal|treue/.test(q)){answer={role:"assistant",kind:"club",text:"Im Demo-Club gibt es 1 Punkt je Euro Eintritt. 100 Punkte ergeben einen 5-€-Vorteil. Für Rückkehrer ist eine Aktion mit doppelten Punkten vorbereitet. Die konkrete Club-Logik ist ein Vorschlag für eure Roadmap."};}
  else if(/brief|heut|tag/.test(q)){answer={role:"assistant",kind:"briefing",text:"Dein Tag im Überblick: 86 Gäste sind im Haus, 3 Geburtstage stehen an und 6 Mitarbeitende sind im Einsatz. Für morgen hat der Wetter-Agent eine Empfehlung vorbereitet. Außerdem könnten 47 Familien eine Einladung zum Wiederkommen erhalten."};}
  else{answer={role:"assistant",kind:"unknown",text:"Dazu habe ich in dieser Demo keine verlässliche Antwort. Ich kann dir die vorbereiteten Beispiele zu Wetter, Buchungen, Familien, Club-Punkten und Schichten zeigen. Ein angebundener Wissensassistent wäre der nächste Umsetzungsschritt."};}
  window.setTimeout(()=>{setMessages(m=>[...m,answer]);setThinking(false)},650);
 }
 const recipients=campaign==="return"?(channel==="email"?47:31):scenario==="sun"?(channel==="email"?96:52):(channel==="email"?184:96);
 useEffect(()=>{const key=(e:KeyboardEvent)=>{if((e.metaKey||e.ctrlKey)&&e.key==="k"){e.preventDefault();setSearchOpen(v=>!v)}};window.addEventListener("keydown",key);return()=>window.removeEventListener("keydown",key)},[]);
 useEffect(()=>{setBrowserDate(browserLocalDate())},[]);
 useEffect(()=>{
  if(!workspaceReady||!anchorDate||view!=="bookings") return;
  const dates=periodDatesUnion(anchorDate, [birthdayPeriod, visitPeriod]);
  let cancelled=false;
  setRangeFailed(false);
  void (async()=>{
    const lists=await Promise.all(dates.map((date)=>fetchSectionBookings("bookings", date)));
    if(cancelled) return;
    if(lists.some((list)=>!list)){setRangeFailed(true);setRangeBookings([]);return;}
    setRangeBookings(lists.flatMap((list, index)=>list!.map((row)=>({...row, date:dates[index]!}))));
  })();
  return()=>{cancelled=true};
 },[workspaceReady, anchorDate, view, birthdayPeriod, visitPeriod, bookingRevision]);
 useEffect(()=>{bottomRef.current?.scrollIntoView({behavior:"smooth"})},[messages,thinking]);
 useEffect(()=>{
  enableWorkspaceFromEnv();
  if(!isWorkspaceMode()) return;
  let cancelled=false;
  void (async()=>{
    const bootstrap=await fetchBootstrap();
    if(cancelled) return;
    if(!bootstrap){setWorkspaceFailed(true);return;}
    setVenueDate(bootstrap.localDate);
    setWorkspaceReady(true);
    const bookings=await fetchSectionBookings("bookings", bootstrap.localDate);
    if(cancelled) return;
    if(bookings){setLiveBookings(bookings);setBookingsFailed(false);}
    else setBookingsFailed(true);
    const packages=await fetchPackages();
    if(!cancelled&&packages){
      setLivePackages(packages);
      if(packages[0]) setSelectedPackageId(packages[0].id);
    }
  })();
  return()=>{cancelled=true};
 },[]);
 useEffect(()=>{
  if(!workspaceReady||!anchorDate||!canSeeBookings) return;
  setPriorDays(null);
  const dates=historyDates(anchorDate).slice(0,-1);
  let cancelled=false;
  void (async()=>{
    const lists=await Promise.all(dates.map((date)=>fetchSectionBookings("bookings", date)));
    if(cancelled) return;
    if(lists.some((list)=>list===null)){setPriorDays(null);return;}
    setPriorDays(lists.flatMap((list, index)=>list!.map((row)=>({date:dates[index]!,type:row.type}))));
  })();
  return()=>{cancelled=true};
 },[workspaceReady, anchorDate, canSeeBookings]);
 useEffect(()=>{
  if(!workspaceReady||!anchorDate||!canSeeBookings) return;
  let cancelled=false;
  setOccupancyState("loading");
  void (async()=>{
    const next=await fetchReservationSpan(anchorDate, addDays(anchorDate, 31));
    if(cancelled) return;
    if(!next){setSpanBookings(null);setOccupancyState("failed");return;}
    setSpanBookings(next);
    setOccupancyState("ready");
  })();
  return()=>{cancelled=true};
 },[workspaceReady, anchorDate, canSeeBookings, bookingRevision]);
 useEffect(()=>{
  if(!workspaceReady||!isWorkspaceMode()) return;
  let cancelled=false;
  void (async()=>{
    if(view==="bookings"||view==="today"||view==="tickets"){
      const bookings=await fetchSectionBookings("bookings");
      if(cancelled) return;
      if(bookings){setLiveBookings(bookings);setBookingsFailed(false);}
      else setBookingsFailed(true);
    }
    if(view==="reports"||view==="today"){
      const report=await fetchReports();
      if(!cancelled&&report) setLiveReport(report);
    }
    if((view==="team"||view==="today")&&(!staff||staff.capabilities.team)){
      const team=await fetchTeamLive();
      if(!cancelled) setLiveTeam(team);
    }
  })();
  return()=>{cancelled=true};
 },[view,workspaceReady,capabilityKey]);
 useEffect(()=>{
  setPinnedIds(readPinnedIds(pinKey, staff?.capabilities??null));
  setEditingPins(false);
 },[pinKey,capabilityKey]);
 useEffect(()=>{
  if(newBooking&&!idempotencyKey) setIdempotencyKey(newIdempotencyKey());
  if(!newBooking){setIdempotencyKey("");setBookingAlternatives([]);setBookingBusy(false);setNewEmail("");setNewPhone("")}
 },[newBooking,idempotencyKey]);
 useEffect(()=>{
  type ToolContext={registerTool:(tool:unknown,options:{signal:AbortSignal})=>void|Promise<void>};
  const context=(document as unknown as {modelContext?:ToolContext}).modelContext;if(!context?.registerTool)return;
  const lifecycle=new AbortController();
  const register=(tool:unknown)=>{try{Promise.resolve(context.registerTool(tool,{signal:lifecycle.signal})).catch(()=>{})}catch{}};
  register({name:"masulino_read_demo_state",title:"Masulino-Demostand lesen",description:"Liest das aktuelle Wetterszenario und den Status der drei simulierten Agentenvorschläge. Keine Live-Daten.",inputSchema:{type:"object",properties:{},additionalProperties:false},annotations:{readOnlyHint:true,untrustedContentHint:false},execute:()=>({demo:true,scenario,view,suggestions:states})});
  register({name:"masulino_set_demo_scenario",title:"Wetterszenario simulieren",description:"Ändert das sichtbare Wetterszenario und setzt die Wetter- und Teamvorschläge zur erneuten Prüfung zurück. Sendet nichts.",inputSchema:{type:"object",properties:{scenario:{type:"string",enum:["rain","sun","full"]}},required:["scenario"],additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:false},execute:async(input:unknown)=>{const x=input as {scenario?:unknown};if(!x||typeof x!=="object"||Object.keys(x).some(k=>k!=="scenario")||!(["rain","sun","full"] as unknown[]).includes(x.scenario))throw new Error("Ungültiges Szenario");changeScenario(x.scenario as Scenario);await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));return{demo:true,scenario:x.scenario}}});
  return()=>lifecycle.abort();
 },[scenario,view,states]);
 const currentApp=apps.find(a=>a.id===view);
 const title=view==="today"?"Übersicht":view==="agents"?"Agenten":view==="knowledge"?"Wissen":view==="concept"?"Konzept & Quellen":currentApp?.name??"Übersicht";
 function tileMeta(app:AppTile):string{
  if(!staff||!liveTileIds.has(app.id)) return app.meta;
  if(app.id==="bookings"){
    if(!staff.capabilities.bookings||bookingsFailed||workspaceFailed) return "—";
    if(!liveBookings) return "…";
    return `${liveBookings.length.toLocaleString("de-DE")} heute`;
  }
  if(app.id==="families"){
    if(!staff.capabilities.families||familiesFailed) return "—";
    if(!liveFamilies) return "…";
    return `${liveFamilies.length.toLocaleString("de-DE")} Familien`;
  }
  if(app.id==="team"){
    if(!staff.capabilities.team||liveTeam===null) return "—";
    if(liveTeam===undefined||!venueDate) return "…";
    return `${onDutyCount(liveTeam, venueDate).toLocaleString("de-DE")} im Einsatz`;
  }
  if(!staff.capabilities.reports||workspaceFailed||(workspaceReady&&!venueDate)) return "—";
  if(!venueDate) return "…";
  return monthLabel(venueDate);
 }
 function startPinEdit(){setPinDraft(pinnedIds);setEditingPins(true);}
 function cancelPinEdit(){setEditingPins(false);setPinDraft(pinnedIds);}
 function savePinEdit(){
  const allowed=new Set(orderedAppIds(staff?.capabilities??null));
  const next=pinDraft.filter((id)=>allowed.has(id));
  setPinnedIds(next);
  window.localStorage.setItem(pinStorageKey(pinKey), JSON.stringify(next));
  setEditingPins(false);
 }
 const iconButton=(Icon:LucideIcon,label:string,action:()=>void)=><button className="icon-button" aria-label={label} onClick={action}><Icon size={20}/></button>;
 function AgentCard({kind,compact=false}:{kind:Suggestion;compact?:boolean}){const state=states[kind];return <article className={"agent-card "+(compact?"compact ":"")+kind}>
   <div className="agent-eyebrow"><span className={"agent-glyph "+(kind==="weather"?"blue":kind==="return"?"violet":"amber")}>{kind==="weather"?<CloudRain size={16}/>:kind==="return"?<Heart size={16}/>:<Users size={16}/>}</span><span>{kind==="weather"?"Wetter-Agent":kind==="return"?"Familien-Agent":"Betriebs-Agent"}</span><span className="agent-time">09:{kind==="weather"?"40":kind==="return"?"32":"15"}</span></div>
   <h3>{agentTitles[kind]}</h3><p>{kind==="weather"?d.agentCopy:kind==="return"?"47 Familien waren länger nicht hier. Ein persönlicher Willkommensgruß liegt bereit.":scenario==="full"?"Voller Vormittag: Besetzung und Einlass gemeinsam prüfen.":"Eine zusätzliche Person am Check-in könnte die Stoßzeit von 13–15 Uhr entlasten."}</p>
   <div className="agent-bottom"><span className={"agent-benefit "+(kind==="team"?"muted":"")}>{kind==="weather"?(scenario==="full"?"Kapazität vor Kampagnen":"+"+d.opportunity+" Besuche* "):kind==="return"?"60+ Tage ohne Besuch":"1 Schichtlücke"}</span>{state!=="pending"?<Pill tone="green">{state==="planned"?"Vorgemerkt":"Morgen erinnern"}</Pill>:null}</div>
   {state==="pending"?<div className="agent-actions"><button className={kind==="weather"?"button dark compact-button":"button soft compact-button"} onClick={()=>kind==="weather"&&scenario==="full"?ask("Wie wird morgen?"):openCampaign(kind)}>{kind==="weather"&&scenario==="full"?"Kapazität prüfen":kind==="team"?"Schicht prüfen":"Vorschlag ansehen"}</button><button className="icon-button" aria-label={(kind==="return"?"Familien":kind==="team"?"Betriebs":"Wetter")+"-Vorschlag zurückstellen"} onClick={()=>snooze(kind)}><Clock3 size={18}/></button></div>:<button className="text-button" onClick={()=>setStates(s=>({...s,[kind]:"pending"}))}>Erneut prüfen</button>}
  </article>}
 const grantedIds=orderedAppIds(staff?.capabilities??null);
 const pinSelection=(editingPins?pinDraft:pinnedIds).filter((id)=>grantedIds.includes(id));
 function PinnedApps(){
  const shown=pinSelection.map((id)=>apps.find((app)=>app.id===id)).filter((app):app is AppTile=>Boolean(app));
  const unpinned=grantedIds.filter((id)=>!pinSelection.includes(id)).map((id)=>apps.find((app)=>app.id===id)).filter((app):app is AppTile=>Boolean(app));
  if(shown.length===0&&!editingPins) return <div className="empty-state surface"><h3>Keine Apps festgehalten.</h3><p>Über den Stift nimmst du Apps in diese Übersicht.</p></div>;
  return <>
    <div className="apps-grid">{shown.map((app)=>editingPins?<div key={app.id} className="app-card editing"><JellyButton variant="soft" className="pin-remove" aria-label={app.name+" entfernen"} onClick={()=>setPinDraft((ids)=>ids.filter((id)=>id!==app.id))}><X size={16} strokeWidth={1.8}/></JellyButton><IconTile icon={app.icon} color={app.color}/><div><strong>{app.name}</strong><span>{tileMeta(app)}</span></div></div>:<button key={app.id} type="button" className="app-card" onClick={()=>navigate(app.id)}><IconTile icon={app.icon} color={app.color}/><div><strong>{app.name}</strong><span>{tileMeta(app)}</span></div></button>)}</div>
    {editingPins&&<div className="pin-catalog"><p>Weitere Apps</p>{unpinned.length===0?<p>Alle freigegebenen Apps sind festgehalten.</p>:unpinned.map((app)=><JellyButton key={app.id} variant="soft" onClick={()=>setPinDraft((ids)=>ids.includes(app.id)?ids:[...ids,app.id])}><app.icon size={16} strokeWidth={1.8}/>{app.name}<Plus size={16} strokeWidth={1.8}/></JellyButton>)}</div>}
  </>;
 }
 function BookingRows({items,showDate=false}:{items:Array<{id:string;time:string;name:string;detail:string;type:string;color:string;date?:string}>;showDate?:boolean}){return <div className="booking-list">{items.length===0?<div className="empty-state"><Search size={26}/><h3>Keine Buchung</h3><p>In diesem Zeitraum steht hier nichts an.</p></div>:items.map(r=>{const marked=checkedIn.includes(r.id);return <div className="booking-row" key={r.id}><time>{showDate&&r.date?formatDayLabel(r.date)+" · "+r.time:r.time}</time><IconTile icon={r.type==="Geburtstag"?Cake:Users} color={r.color} small/><button className="booking-name" onClick={()=>setDetailBooking(r.id)}><strong>{r.name}</strong><span>{r.detail}</span></button><JellyButton variant={marked?"dark":"soft"} className="checkin" aria-pressed={marked} onClick={()=>{setCheckedIn(c=>c.includes(r.id)?c.filter(id=>id!==r.id):[...c,r.id]);toast(marked?"Markierung entfernt":"Nur in dieser Ansicht markiert. Der Check-in wird nicht gespeichert.")}}>{marked?<><Check size={14} strokeWidth={1.8}/>Check-in aufheben</>:"Check-in"}</JellyButton></div>})}</div>}
 function BookingTable({short=false}:{short?:boolean}){if(bookingsLoading)return <div className="empty-state" aria-live="polite"><h3>Buchungen werden geladen.</h3></div>;const items=allBookings.slice(0,short?3:50);return <BookingRows items={items}/>}
 function appContent(){
  if(staff&&!viewVisible(view, staff.capabilities))return <div className="empty-state surface"><ShieldCheck size={28}/><h3>Kein Zugriff.</h3><p>{staff.roleLabel} darf diesen Bereich nicht öffnen.</p></div>;
  if(view==="bookings"){
    const dates=anchorDate?periodDatesUnion(anchorDate, [birthdayPeriod, visitPeriod]):[];
    const birthdayDates=new Set(anchorDate?periodDates(anchorDate, birthdayPeriod):[]);
    const visitDates=new Set(anchorDate?periodDates(anchorDate, visitPeriod):[]);
    const allowed=new Set(dates);
    const fixtureRows=fixtureBookings.map((row)=>({...row, date:anchorDate??"", tables:[] as string[], status:"confirmed"}));
    const source=liveMode?(rangeBookings??[]):fixtureRows;
    const ranged=source.filter((row)=>allowed.has(row.date)&&row.status!=="cancelled"&&!hiddenBookings.includes(row.id));
    const birthdays=ranged.filter((row)=>birthdayDates.has(row.date)&&row.type==="Geburtstag");
    const visits=ranged.filter((row)=>visitDates.has(row.date)&&row.type!=="Geburtstag");
    const loadingRange=liveMode&&rangeBookings===null;
    const canRemove=!staff||staff.capabilities.createBooking;
    async function removeBooking(row: ScheduleRow){
      if(workspaceReady&&typeof row.version==="number"){
        const result=await cancelBooking({reservationId:row.id, expectedVersion:row.version});
        if(!result.ok){toast(result.reason);return false;}
        toast("Buchung entfernt",{description:"Der Tisch ist frei. Es wurde keine Nachricht verschickt."});
        setHiddenBookings((ids)=>ids.includes(row.id)?ids:[...ids,row.id]);
        setBookingRevision((value)=>value+1);
        return true;
      }
      setHiddenBookings((ids)=>ids.includes(row.id)?ids:[...ids,row.id]);
      toast("Buchung entfernt");
      return true;
    }
    function toggleCheckIn(id: string){
      setCheckedIn((current)=>current.includes(id)?current.filter((item)=>item!==id):[...current,id]);
      toast(checkedIn.includes(id)?"Markierung entfernt":"Nur in dieser Ansicht markiert. Der Check-in wird nicht gespeichert.");
    }
    const defaultDay=anchorDate&&allowed.has(anchorDate)?anchorDate:(dates[0]??"");
    const periodTools = (
      <div className="toolbar-end">
        <PeriodToggle value={birthdayPeriod} onChange={setBirthdayPeriod} label="Zeitraum Geburtstage" />
        {(!staff||staff.capabilities.createBooking)&&<JellyButton onClick={()=>setNewBooking(true)}><Plus size={17} strokeWidth={1.8}/>Buchung anlegen</JellyButton>}
      </div>
    );
    const visitTools = (
      <div className="toolbar-end">
        <PeriodToggle value={visitPeriod} onChange={setVisitPeriod} label="Zeitraum Kita" />
      </div>
    );
    return <>
      {rangeFailed&&<div className="callout amber"><Info size={22}/><div><strong>Buchungen nicht geladen</strong><p>Der Zeitraum ist gerade nicht erreichbar.</p></div></div>}
      <div className="booking-groups">
        {loadingRange?<><div className="list-block"><div className="section-head"><div className="section-title"><h2>{"Geburtstage · "+periodLabel(birthdayPeriod)}</h2></div>{periodTools}</div><section className="surface"><div className="empty-state"><h3>Buchungen werden geladen.</h3></div></section></div><div className="list-block"><div className="section-head"><div className="section-title"><h2>{"Kita- und Schulbesuche · "+periodLabel(visitPeriod)}</h2></div>{visitTools}</div><section className="surface"><div className="empty-state"><h3>Buchungen werden geladen.</h3></div></section></div></>:<>
          <BookingSchedule title={"Geburtstage · "+periodLabel(birthdayPeriod)} rows={birthdays.map((row)=>scheduleFrom(row, checkedIn.includes(row.id)))} canRemove={canRemove} tools={periodTools} onOpen={setDetailBooking} onCheckIn={toggleCheckIn} onRemove={removeBooking}/>
          <BookingSchedule title={"Kita- und Schulbesuche · "+periodLabel(visitPeriod)} rows={visits.map((row)=>scheduleFrom(row, checkedIn.includes(row.id)))} canRemove={canRemove} tools={visitTools} onOpen={setDetailBooking} onCheckIn={toggleCheckIn} onRemove={removeBooking}/>
        </>}
      </div>
      {!loadingRange&&defaultDay&&<TableFloor dates={dates} defaultDay={defaultDay} bookings={ranged}/>}
      <div className="info-inline"><Info size={17}/>{liveMode?"Buchungen aus dem Buchungsservice für den gewählten Zeitraum. Check-in bleibt lokal.":"Alle gezeigten Personen und Buchungen sind fiktiv."}</div>
    </>;
  }
  if(view==="families"&&liveMode&&!liveFamilies)return <section className="surface"><div className="empty-state"><Users size={26}/><h3>Keine Familien aus dem Betrieb</h3><p>Diese Anmeldung hat hier keine Kontaktliste.</p></div></section>;if(view==="families"){const familyRows=liveFamilies?liveFamilies.map(f=>({n:f.name,t:f.lastVisit,p:f.points,s:f.consent,l:f.longAbsent})) : [{n:"Familie Keller",t:"vor 74 Tagen",p:86,s:true,l:true},{n:"Familie Sommer",t:"vor 63 Tagen",p:142,s:true,l:true},{n:"Familie Braun",t:"vor 3 Tagen",p:54,s:true,l:false},{n:"Familie Richter",t:"vor 92 Tagen",p:28,s:false,l:true}];
  return <><div className="family-summary"><div><span className="eyebrow">MASULINO CLUB</span><h2>Eine Verbindung, die bleibt.</h2><p>Besuche, Lieblingsmomente und ein guter Grund, wiederzukommen.</p>{liveFamilies?<p>Kontakte mit Marketing-Freigabe stehen in der Tabelle. Ein Versand ist nicht angebunden.</p>:(!staff||staff.capabilities.campaigns)&&<button className="button dark" onClick={()=>openCampaign("return")}>{(liveAudienceCount??47)+" Familien wieder einladen"}</button>}</div><span className="big-number">{liveFamilies?String(liveFamilies.length):"1.248"}<small>{liveFamilies?"Kontakte am Standort":"Familien im Demo-Club"}</small></span></div><Tabs value={familyFilter} onValueChange={setFamilyFilter}><TabsList><TabsTrigger value="all">Alle Familien</TabsTrigger><TabsTrigger value="return">Länger nicht da</TabsTrigger></TabsList><TabsContent value={familyFilter}><div className="section-head"><h2>Familien</h2><span className="pill">{familyRows.filter(f=>familyFilter==="all"||f.l).length.toLocaleString("de-DE")}</span></div><section className="surface table-surface"><DataTable rows={familyRows.filter(f=>familyFilter==="all"||f.l)} columns={familyColumns} rowKey={(row)=>row.n} initialSort={{id:"name", direction:"asc"}} empty={<div className="empty-state"><h3>Keine Familie in dieser Ansicht</h3><p>Ein anderer Filter oder ein späterer Besuchsnachweis füllt die Tabelle.</p></div>}/></section></TabsContent></Tabs><p className="fine-print">{liveFamilies?"Kontakte und Consent aus dem Domain-Service. Letzter Besuch bleibt leer, bis Besuchsnachweise angebunden sind.":"Auszug aus fiktiven Kundendaten. Nur Kontakte mit passender Freigabe werden für Kampagnen berücksichtigt."}</p></>;}
  if(view==="team"&&workspaceReady)return <><LiveTeamPanel team={liveTeam}/><section className="personal-live-demo" aria-label="Planungsdemo"><div className="section-head"><h2>Planungsdemo</h2><Pill>Beispieldaten</Pill></div><p className="fine-print">Getrennt von den Daten oben: Namen, Schichten und Zeiten sind fiktiv und werden nicht gespeichert.</p><PersonalWorkspace/></section></>;if(view==="team")return <PersonalWorkspace/>;
  if(view==="reports") return <PosDashboard/>;
  if(view==="campaigns")return <><div className="two-cards"><AgentCard kind="weather"/><AgentCard kind="return"/></div><section className="surface"><div className="section-head"><h2>Aktivität</h2><History size={18}/></div>{logs.length?logs.map((l,i)=><div className="log-row" key={i}><CircleCheck size={19}/><div><strong>{l.title}</strong><p>{l.detail}</p></div></div>):<div className="empty-state"><Mail size={30}/><h3>Noch keine Kampagne eingeplant</h3><p>Öffne einen Vorschlag und prüfe Zielgruppe, Nachricht und Versandzeit.</p></div>}</section></>;
  if(view==="tickets")return <div className="pos-grid"><section className="surface"><div className="section-head"><h2>Eintritt</h2><Pill>Demo-Kasse</Pill></div><div className="ticket-card"><IconTile icon={Ticket}/><div><h3>Kinderticket</h3><p>Tageseintritt · Demo-Preis</p></div><strong>12,00 €</strong><button className="button soft" onClick={()=>setCart(c=>c+1)} aria-label="Kinderticket hinzufügen"><Plus size={18}/></button></div><BookingTable short/></section><section className="surface cart"><h2>Warenkorb</h2><p>{cart} × Kinderticket</p><strong className="cart-total">{(cart*12).toFixed(2).replace(".",",")} €</strong><button className="button dark" disabled={cart===0} onClick={()=>{setSale(s=>s+cart*12);setCart(0);toast("Demo-Zahlung abgeschlossen",{description:"Es wurde kein Geld abgebucht."})}}><CreditCard size={18}/>Demo-Zahlung</button><button className="text-button" onClick={()=>setCart(0)}>Leeren</button>{sale>0&&<Pill tone="green">Heute simuliert: {sale} €</Pill>}</section></div>;
  if(view==="bistro")return <section className="surface"><div className="section-head"><h2>Bestand im Blick</h2><Pill>Beispieldaten</Pill></div><Table><TableHeader><TableRow><TableHead>Artikel</TableHead><TableHead>Bestand</TableHead><TableHead>Status</TableHead></TableRow></TableHeader><TableBody>{[{n:"Kaffeebohnen",v:"6,2 kg",s:"Gut versorgt"},{n:"Apfelsaft",v:"28 Flaschen",s:"Gut versorgt"},{n:"Pommes",v:"4,5 kg",s:"Nachbestellen"}].map(x=><TableRow key={x.n}><TableCell>{x.n}</TableCell><TableCell>{x.v}</TableCell><TableCell><Pill tone={x.s==="Nachbestellen"?"amber":"green"}>{x.s}</Pill></TableCell></TableRow>)}</TableBody></Table><div className="callout amber"><Coffee size={22}/><div><strong>Vorrat für den Regentag prüfen</strong><p>Besuchsprognosen könnten künftig auch den Bistrobedarf vorbereiten.</p></div><button className="button soft" onClick={()=>{setReminder(!reminder);toast(reminder?"Demo-Erinnerung entfernt":"Erinnerung in dieser Demo vorgemerkt")}}>{reminder?"Vorgemerkt":"Erinnerung vormerken"}</button></div></section>;
  return null
 }
 function Stat({icon:Icon,label,value,note,warning=false}:{icon:LucideIcon;label:string;value:string;note:string;warning?:boolean}){return <div className="stat"><div className="stat-label"><Icon size={16}/>{label}</div><div className="stat-value">{value}</div><div className={"stat-note "+(warning?"warning":"")}>{note}</div></div>}

 return <SidebarProvider style={{"--sidebar-width":"224px","--sidebar-width-icon":"72px"} as CSSProperties}><Navigation view={view} onNavigate={navigate} pending={pending} staff={staff}/><div className="main-shell"><header className="topbar"><div className="breadcrumb"><SidebarTrigger className="mobile-nav-trigger"/><SidebarShowButton/><h1 className="topbar-title">{title}<span className="orange-text">.</span></h1></div><div className="header-actions">{iconButton(Search,"Suchen",()=>setSearchOpen(true))}</div></header>
 <main className="main-content" id="main-content">
 {view==="today"?<>
  <div className="dashboard-header">
  <section className="welcome"><div><div className="eyebrow">{staff?.dateLabel||"DIENSTAG, 29. SEPTEMBER 2026"}</div><h1>Guten Morgen, {staff?.firstName??"Peed"}<span className="orange-text">.</span></h1></div></section>
  {staff && !staff.capabilities.bookings && !staff.capabilities.reports && !staff.capabilities.it && <div className="callout blue"><Users size={22}/><div><strong>Dein Arbeitsbereich</strong><p>Schichten und eigene Zeiten. Buchungen, Auswertungen und Kampagnen sind für diese Rolle nicht freigegeben.</p></div></div>}
  <section className="kpi-row" aria-label="Tageskennzahlen">
    <KpiCard label="Buchungen heute" value={canSeeBookings?(workspaceFailed||bookingsFailed?"—":bookingsLoading?"…":dashboardBookings.length):"—"} delta={bookingSeries?deltaAgainstPrevious(bookingSeries):undefined} deltaLabel={canSeeBookings?(workspaceFailed||bookingsFailed?"Die Buchungen sind gerade nicht erreichbar.":bookingsLoading?"Buchungen werden geladen.":historyCaption(bookingSeries,"booking")):"Für diese Rolle nicht freigegeben."} trend={bookingSeries}/>
    <KpiCard label="Geburtstage heute" value={canSeeBookings?(workspaceFailed||bookingsFailed?"—":bookingsLoading?"…":dashboardBirthdays):"—"} delta={birthdaySeries?deltaAgainstPrevious(birthdaySeries):undefined} deltaLabel={canSeeBookings?(workspaceFailed||bookingsFailed?"Die Buchungen sind gerade nicht erreichbar.":bookingsLoading?"Buchungen werden geladen.":historyCaption(birthdaySeries,"birthday")):"Für diese Rolle nicht freigegeben."} trend={birthdaySeries}/>
    <KpiCard label="Gebuchter Wert" value={liveReport?liveReport.bookedValueMinor/100:"—"} format={liveReport?"currency":"number"} currency={liveReport?.currency??"EUR"} deltaLabel={liveReport?"Zugesagter Betrag dieses Monats. Keine eingegangene Zahlung.":"Platzhalter"}/>
    <KpiCard label="Gäste im Haus" value="—" deltaLabel="Platzhalter · Check-in nicht angebunden."/>
  </section>
  </div>
  <div className="dashboard-grid"><div className="dashboard-primary">
    {false && <section className={"weather-card "+scenario}><div className="weather-topline"><span><CloudRain size={17}/>WETTER TRIFFT SPIELRAUM</span><Choice label="Wetterszenario" value={scenario} onChange={v=>changeScenario(v as Scenario)} items={[{value:"rain",label:"Szenario: Regen"},{value:"sun",label:"Szenario: Sonne"},{value:"full",label:"Szenario: Volles Haus"}]}/></div><div className="weather-main"><div><h2>{d.title.split("\n").map((line,i)=><span key={i}>{line}</span>)}</h2><p>{d.description}</p><button className="button weather-button" onClick={()=>scenario==="full"?ask("Wie wird morgen?"):openCampaign("weather")}>{scenario==="full"?"Besetzung prüfen":"Kampagne prüfen"}</button></div><div className="weather-visual"><d.icon size={63} strokeWidth={1.25}/><strong>{d.temperature}</strong><span>Morgen · {d.rain} Regen</span></div></div><div className="forecast-strip">{["Heute","Morgen","Do","Fr"].map((day,i)=>{const WeatherIcon=scenario==="sun"?Sun:[CloudSun,CloudRain,Cloud,CloudSun][i];return <div key={day} className={i===1?"tomorrow":""}><span>{day}</span><WeatherIcon size={20}/><strong>{d.forecast[i]}°</strong></div>})}<div className="forecast-insight"><span>{scenario==="full"?"Erwartete Auslastung":"Auslastung im Aktionsfenster"}</span><strong>{d.occupancy} % <span>{scenario==="full"?"keine Aktion": "Platz für mehr"}</span></strong></div></div></section>}
    <section className="apps-section"><div className="section-head"><h2>Deine Apps</h2><div className="pin-actions">{editingPins?<><JellyButton variant="soft" onClick={cancelPinEdit}>Abbrechen</JellyButton><JellyButton onClick={savePinEdit}>Fertig</JellyButton></>:<JellyButton variant="icon" aria-label="Fixierte Apps bearbeiten" aria-pressed="false" onClick={startPinEdit}><Pencil size={18} strokeWidth={1.8}/></JellyButton>}</div></div><PinnedApps/></section>
    <section className="dashboard-section">{!canSeeBookings?<><div className="section-head"><h2>Tischauslastung</h2></div><div className="surface"><p className="fine-print">Für diese Rolle nicht freigegeben.</p></div></>:liveMode&&occupancyState==="loading"?<><div className="section-head"><h2>Tischauslastung</h2></div><div className="surface"><p className="fine-print" aria-live="polite">Die Buchungen werden geladen.</p></div></>:liveMode&&occupancyState==="failed"?<><div className="section-head"><h2>Tischauslastung</h2></div><div className="surface"><p className="fine-print" role="alert">Die Buchungen sind gerade nicht erreichbar. Es wurde nichts neu berechnet.</p></div></>:anchorDate?<OccupancyPanel rows={occupancyRows} anchorDate={anchorDate}/>:null}</section>
    {(!staff || staff.capabilities.bookings) && <section className="dashboard-section"><div className="section-head"><h2>Heutige Buchungen</h2><JellyButton onClick={()=>navigate("bookings")}>Buchungen öffnen</JellyButton></div><div className="surface day-section"><BookingTable short/></div></section>}
  </div>{false && <aside className="agent-column"><div className="section-head agent-heading"><h2><Sparkles size={19}/>Für dich vorausgedacht</h2><span className="count-bubble">{pending}</span></div><div className="agent-card-stack">{(Object.keys(states) as Suggestion[]).filter(k=>enabled[k]&&states[k]==="pending").map(k=><AgentCard key={k} kind={k} compact/>)}{pending===0&&<div className="empty-state surface"><CircleCheck size={28}/><h3>Alles im Blick.</h3><p>Alle Hinweise sind bearbeitet oder pausiert.</p><button className="text-button" onClick={()=>navigate("agents")}>Aktivität ansehen</button></div>}</div><div className="assistant-card"><span className="masu-symbol"><Sparkles size={24}/></span><div><h3>Frag einfach Masu.</h3><p>Dein Wissen. Deine Apps.<br/>Eine Antwort entfernt.</p></div><button className="assistant-input" onClick={()=>setChatOpen(true)}><span>Was möchtest du wissen?</span><Plus size={19}/></button></div><p className="side-footnote">* Illustratives Potenzial, keine Zusage.<br/>Alle Daten und Agenten sind simuliert.</p></aside>}</div>
 </>:<>{view==="agents"&&!staff&&<div className="section-head end"><button type="button" className="button soft" onClick={()=>setRulesOpen(true)}><Settings2 size={17}/>Agentenregeln</button></div>}
 {false?<><div className="agent-summary"><div><span className="tiny-label">ZULETZT SIMULIERT</span><strong>Heute, 09:40</strong></div><div><span className="tiny-label">DEINE FREIGABE</span><strong>Immer vor einer Aktion</strong></div><div><span className="tiny-label">AKTIVE AGENTEN</span><strong>{Object.values(enabled).filter(Boolean).length} von 3</strong></div></div><Tabs value={agentFilter} onValueChange={setAgentFilter}><TabsList><TabsTrigger value="pending">Zur Prüfung · {pending}</TabsTrigger><TabsTrigger value="history">Aktivität</TabsTrigger><TabsTrigger value="all">Alle Agenten</TabsTrigger></TabsList><TabsContent value="pending"><div className="agents-grid">{(Object.keys(states) as Suggestion[]).filter(k=>states[k]==="pending"&&enabled[k]).map(k=><AgentCard key={k} kind={k}/>)}{pending===0&&<div className="empty-state surface"><CheckCheck size={30}/><h3>Alles erledigt.</h3><p>Unter Aktivität findest du deine Entscheidungen.</p></div>}</div></TabsContent><TabsContent value="history"><section className="surface">{logs.length?logs.map((l,i)=><div className="log-row" key={i}><History size={18}/><div><strong>{l.title}</strong><p>{l.detail}</p></div></div>):<div className="empty-state"><History size={28}/><h3>Noch keine Entscheidungen</h3><p>Hier erscheint, was du freigibst oder zurückstellst.</p></div>}</section><div className="agents-grid">{(Object.keys(states) as Suggestion[]).filter(k=>states[k]!=="pending").map(k=><AgentCard key={k} kind={k}/>)}</div></TabsContent><TabsContent value="all"><div className="agents-grid">{(Object.keys(states) as Suggestion[]).map(k=><div key={k}><div className="agent-toggle"><span>{enabled[k]?"Hinweise aktiv":"Hinweise pausiert"}</span><Switch checked={enabled[k]} onCheckedChange={v=>setEnabled(e=>({...e,[k]:v}))} aria-label={(k==="weather"?"Wetter":k==="return"?"Familien":"Betrieb")+"-Hinweise aktiv"}/></div><AgentCard kind={k}/></div>)}</div></TabsContent></Tabs></>:false?<><button className="knowledge-search" onClick={()=>setSearchOpen(true)}><Search size={22}/><span>Wissen, Regeln und Abläufe finden …</span><kbd>⌘ K</kbd></button><div className="knowledge-grid">{knowledge.map((a,i)=><button className="surface knowledge-card" key={a.title} onClick={()=>setSelectedArticle(i)}><IconTile icon={a.icon} color={["violet","pink","blue","green"][i]}/><h2>{a.title}</h2><p>{a.text}</p><span className="text-button">Wissenskarte öffnen</span></button>)}</div><div className="info-inline"><BookOpen size={17}/>Beispielwissen für diesen Prototyp; eure echten Betriebsregeln werden später angebunden.</div></>:false?<Concept/>:appContent()}
 </>}
 </main></div>

 <Dialog open={searchOpen} onOpenChange={setSearchOpen}><DialogContent className="search-dialog" showCloseButton={false}><DialogTitle className="sr-only">Masulino durchsuchen</DialogTitle><DialogDescription className="sr-only">Apps, Buchungen und Wissenskarten finden.</DialogDescription><Command><CommandInput value={query} onValueChange={setQuery} placeholder="Was möchtest du finden?"/><CommandList><CommandEmpty><p>Keine direkten Treffer.</p>{!staff&&<button className="button soft" onClick={()=>{setSearchOpen(false);ask(query)}}>Masu dazu fragen</button>}</CommandEmpty><CommandGroup heading="Apps">{apps.filter(a=>appVisible(a.id, staff?.capabilities??null)).map(a=><CommandItem key={a.id} value={a.name+" "+a.description} onSelect={()=>navigate(a.id)}><a.icon size={18}/><span>{a.name}</span><span className="command-meta">App öffnen</span></CommandItem>)}</CommandGroup><CommandGroup heading="Buchungen">{allBookings.map(b=><CommandItem key={b.id} value={b.name+" "+b.id} onSelect={()=>{setSearchOpen(false);setDetailBooking(b.id)}}><CalendarDays size={18}/>{b.name}<span className="command-meta">{b.time}</span></CommandItem>)}</CommandGroup><CommandGroup heading="Wissen">{knowledge.map((a,i)=><CommandItem key={a.title} value={a.title+" "+a.text} onSelect={()=>{setSearchOpen(false);setSelectedArticle(i)}}><BookOpen size={18}/>{a.title}</CommandItem>)}</CommandGroup></CommandList><div className="command-footer"><span>Mit ↑ ↓ wählen · Enter zum Öffnen</span><kbd>esc</kbd></div></Command></DialogContent></Dialog>

 <Sheet open={chatOpen} onOpenChange={setChatOpen}><SheetContent className="chat-sheet" showCloseButton={false}><header className="chat-header"><span className="masu-symbol"><Sparkles size={23}/></span><div><SheetTitle>Masu</SheetTitle><SheetDescription>Dein Assistent im Spielraum</SheetDescription></div><SheetClose className="icon-button" aria-label="Assistent schließen"><X size={20}/></SheetClose></header><div className="chat-demo-note"><Info size={14}/>Demo-Assistent · vorbereitete Antworten</div><div className="chat-messages">{messages.length===0?<div className="chat-welcome"><span className="chat-orbit"><Sparkles size={35}/></span><h2>Was machen wir<br/>heute möglich?</h2><p>Ich helfe dir, den Überblick zu behalten und den nächsten Schritt zu finden.</p><div className="chat-prompts">{["Wie wird morgen?","Welche Familien fehlen uns?","Was steht heute an?","Wie funktionieren Club-Punkte?"].map(q=><button key={q} onClick={()=>ask(q)}>{q}<Plus size={16}/></button>)}</div></div>:messages.map((m,i)=><div className={"chat-message "+m.role} key={i}>{m.role==="assistant"&&<div className="message-label"><Sparkles size={14}/>MASU</div>}<p>{m.text}</p>{m.kind&&m.kind!=="unknown"&&<div className="answer-card"><div className="answer-card-top">{m.kind==="weather"?<><d.icon size={21}/><strong>{d.temperature} · {d.occupancy} % Auslastung</strong></>:m.kind==="return"?<><Users size={21}/><strong>47 passende Familien</strong></>:m.kind==="team"?<><Users size={21}/><strong>{scenario==="full"?"Morgen · Check-in 09–12 Uhr":"Samstag · Check-in 13–15 Uhr"}</strong></>:m.kind==="bookings"?<><Cake size={21}/><strong>3 Geburtstage heute</strong></>:m.kind==="club"?<><Heart size={21}/><strong>100 Punkte = 5 € Vorteil</strong></>:<><CalendarCheck size={21}/><strong>Dein Tagesüberblick</strong></>}</div><span className="source-caption">Quelle: {m.kind==="weather"?"Demo-Wetter + Besuchsprognose · 09:40":m.kind==="return"?"Demo-CRM · Segment Wiederbesuch":m.kind==="team"?(scenario==="full"?"Demo-Schichtplan · Mittwoch":"Demo-Schichtplan · Samstag"):m.kind==="club"?"Wissenskarte: Club & Treuepunkte":"Demo-Buchungen · 29.09.2026"}</span><button className="button soft" onClick={()=>{setChatOpen(false);if(m.kind==="weather"){scenario==="full"?navigate("team"):openCampaign("weather")}else if(m.kind==="return")openCampaign("return");else if(m.kind==="team")openCampaign("team");else if(m.kind==="club")navigate("families");else navigate("bookings")}}>{m.kind==="weather"&&scenario!=="full"||m.kind==="return"?"Vorschlag gemeinsam prüfen":"Details öffnen"}</button></div>}</div>)}{thinking&&<div className="thinking"><span/><span/><span/>Masu schaut nach …</div>}<div ref={bottomRef}/></div><form className="chat-composer" onSubmit={e=>{e.preventDefault();ask(chatInput)}}><label className="sr-only" htmlFor="chat-question">Deine Frage</label><textarea id="chat-question" value={chatInput} onChange={e=>setChatInput(e.target.value)} placeholder="Frag Masu …" onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();ask(chatInput)}}}/><button className="send-button" disabled={!chatInput.trim()||thinking} aria-label="Frage senden"><Send size={19}/></button></form><div className="chat-footnote">Demo-Antworten sind keine Live-Auskunft.</div></SheetContent></Sheet>

 <Dialog open={campaign!==null} onOpenChange={v=>{if(!v)setCampaign(null)}}><DialogContent className={"campaign-dialog "+(campaign==="team"?"team-dialog":"")} showCloseButton={false}><CloseDialog/><div className="campaign-header"><div className="agent-eyebrow"><Sparkles size={16}/>{campaign==="weather"?"WETTER-AGENT":campaign==="return"?"FAMILIEN-AGENT":"BETRIEBS-AGENT"}<Pill tone={review?"green":"orange"}>{review?"Bereit zur Entscheidung":"Zur Prüfung"}</Pill></div><DialogTitle>{campaign==="team"?"Eine helfende Hand am Check-in.":campaign==="return"?"Aus lange nicht da wird schön, dass ihr da seid.":d.campaign}</DialogTitle><DialogDescription>{campaign==="team"?"Schichtvorschlag · "+(scenario==="full"?"Mittwoch, 30. September":"Samstag, 3. Oktober"):"Kampagnenentwurf · "+(campaign==="return"?"Wiederbesuch innerhalb von 14 Tagen":scenario==="sun"?"Mittwoch, 30. September · 16–18 Uhr":"Mittwoch, 30. September · 09–12 Uhr")}</DialogDescription></div>
 {campaign==="team"?<><div className="team-proposal"><div className="callout amber"><Users size={24}/><div><strong>{scenario==="full"?"96 % erwartete Auslastung":"7 von 8 benötigten Personen eingeplant"}</strong><p>Eine weitere Person für den Einlass wird vorgeschlagen.</p></div></div><div className="proposed-person"><span className="avatar blue">A</span><div><h3>Alex</h3><p>Check-in · {scenario==="full"?"09:00–12:00":"13:00–15:00"}</p><small>Als verfügbar markiert · Zusage steht noch aus</small></div><Pill tone="blue">Vorschlag</Pill></div><p className="fine-print">Vormerken legt nur einen Prüfeintrag in dieser Demo an. Es wird keine Nachricht verschickt und keine reale Schicht geändert.</p></div><div className="campaign-footer"><button className="button soft" onClick={()=>{snooze("team");setCampaign(null)}}>Morgen erinnern</button><button className="button dark" onClick={planCampaign}>In der Demo vormerken</button></div></>:<>
 <div className="campaign-body"><div className="campaign-editor">{!review?<><div className="evidence-box"><strong><CircleHelp size={16}/>Warum dieser Vorschlag?</strong><p>{campaign==="return"?"78 Familien seit 60+ Tagen ohne Besuch. Nach Kontakt- und Buchungsprüfung bleiben 47 E-Mail-Kontakte.":scenario==="sun"?"24 °C und nur 32 % erwartete Auslastung am späten Nachmittag. Eine kleine Club-Aktion könnte 8–14 zusätzliche Besuche bringen.":"90 % Regenwahrscheinlichkeit. Vormittags 58 % erwartete Auslastung, nachmittags bereits 92 %. Deshalb nur vormittags einladen."}</p><details><summary>Daten & Ausschlüsse ansehen</summary><p>{campaign==="return"?"78 − 18 ohne Kontaktfreigabe − 9 mit Nachricht in den letzten 14 Tagen − 4 mit kommender Buchung = 47. Push-Freigabe liegt für 31 dieser Familien vor.":"Nur Familien mit passender Kontaktfreigabe, ohne aktuelle Buchung und ohne Nachricht in den letzten 14 Tagen. Familien im Wiederbesuchssegment sind ausgeschlossen. Erwartete spontane Besuche sind eingerechnet."}</p><p>Quelle: fiktive Wetter-, CRM- und Buchungsdaten · 29.09.2026, 09:40. Potenziale dienen nur zur Illustration.</p></details></div><div className="form-row"><label>Kanal<Choice label="Kampagnenkanal" value={channel} onChange={setChannel} items={[{value:"email",label:"E-Mail"},{value:"push",label:"App-Push"}]}/></label><label>Versandzeit<Choice label="Versandzeit" value={sendTime} onChange={setSendTime} items={[{value:"today",label:"Heute, 17:00 Uhr"},{value:"tomorrow",label:"Morgen, 08:00 Uhr"}]}/></label></div><label className="field-label">Vorteil<Choice label="Kampagnenvorteil" value={offer} onChange={v=>{setOffer(v);setMessage(v==="none"?"Lust auf neue Spielmomente? Im genannten Zeitraum freuen wir uns auf euren Besuch. Sucht euch euren passenden Termin aus und reserviert eure Spielzeit.":v==="points"?"Zeit für neue Spielmomente! Bei eurem nächsten Besuch im genannten Aktionszeitraum sammelt ihr doppelte Club-Punkte auf euer Kinderticket. Wir freuen uns auf euch!":"Lust auf eine gemeinsame Spielpause? Zu eurem gebuchten Kinderticket im genannten Aktionszeitraum laden wir eine Begleitperson auf einen Kaffee ein. Wir freuen uns auf euch!")}} items={[{value:"coffee",label:"Ein Kaffee zum Kinderticket"},{value:"points",label:"Doppelte Club-Punkte"},{value:"none",label:"Einladung ohne Vorteil"}]}/></label><label className="field-label">Betreff<input maxLength={120} value={subject} onChange={e=>setSubject(e.target.value)}/></label><label className="field-label">Nachricht<textarea rows={4} value={message} onChange={e=>setMessage(e.target.value)}/></label></>:<div className="review-panel"><span className="review-check"><CheckCheck size={28}/></span><h2>Passt alles so?</h2><p>Deine Entscheidung wird in der Demo-Aktivität festgehalten.</p><dl><div><dt>Empfänger</dt><dd>{recipients} Familien mit {channel==="email"?"E-Mail":"Push"}-Freigabe</dd></div><div><dt>Zeitpunkt</dt><dd>{sendTime==="today"?"29.09.2026, 17:00":"30.09.2026, 08:00"}</dd></div><div><dt>Aktionszeitraum</dt><dd>{campaign==="return"?"30.09.–13.10.2026":scenario==="sun"?"30.09., 16–18 Uhr":"30.09., 09–12 Uhr"}</dd></div><div><dt>Vorteil</dt><dd>{offer==="coffee"?"1 Kaffee zum Kinderticket":offer==="points"?"Doppelte Club-Punkte":"Kein zusätzlicher Vorteil"}</dd></div></dl><div className="callout blue"><ShieldCheck size={20}/><p>Vor echtem Versand würden Kontaktfreigabe, Kapazität und Überschneidungen erneut geprüft.</p></div><p className="fine-print">Diese Freigabe simuliert den Ablauf. Sie versendet keine Nachrichten.</p></div>}</div>
 <div className="campaign-preview"><div className="preview-label"><span>VORSCHAU</span><span>{channel==="email"?<Mail size={16}/>:<Smartphone size={16}/>}</span></div><div className="message-preview"><div className="preview-brand"><span className="brand-mini">m</span>masulino.</div><span className="preview-kicker">ZEIT FÜR GEMEINSAME MOMENTE</span><h3>{subject||"Dein Betreff"}</h3><p>Hallo liebe Familie,</p><p>{message}</p><div className="preview-offer">{offer==="coffee"?<Coffee size={20}/>:offer==="points"?<Heart size={20}/>:<Ticket size={20}/>}<div><strong>{offer==="coffee"?"Eine kleine Pause geht auf uns.":offer==="points"?"Doppelte Freude. Doppelte Punkte.":"Wir freuen uns auf euch."}</strong><small>{campaign==="return"?"Gültig 30.09.–13.10.2026":scenario==="sun"?"30. September · 16–18 Uhr":"30. September · 09–12 Uhr"}</small></div></div><span className="preview-cta">Spielzeit buchen · nur Vorschau</span><small className="preview-legal">{offer==="coffee"?"Ein Kaffee je Familienbuchung mit Kinderticket. ":offer==="points"?"Doppelte Punkte auf das Kinderticket. ":""}Buchung nach Verfügbarkeit. {channel==="email"?"Abmelden jederzeit möglich.":"Push-Einstellungen im Familienkonto."}</small></div><div className="audience-summary"><Users size={19}/><div><strong>{recipients} passende Familien</strong><span>Kontaktfreigabe · Pause geprüft</span></div></div><span className="fine-print">Fiktiver Entwurf · Buchungsbutton nur als Vorschau</span></div></div>
 <div className="campaign-footer"><button className="button soft" onClick={()=>review?setReview(false):(snooze(campaign as Suggestion),setCampaign(null))}>{review?"Entwurf bearbeiten":"Morgen erinnern"}</button><span>{review?"Du behältst die Kontrolle.":"Noch nichts eingeplant."}</span><button className="button dark" disabled={!subject.trim()||!message.trim()||scenario==="full"&&campaign==="weather"} onClick={()=>review?planCampaign():setReview(true)}>{review?<><Check size={17}/>Demo-Kampagne einplanen</>:"Freigabe prüfen"}</button></div></>}
 </DialogContent></Dialog>

 <Dialog open={rulesOpen} onOpenChange={setRulesOpen}><DialogContent className="rules-dialog" showCloseButton={false}><CloseDialog/><DialogTitle>Deine Agenten. Deine Regeln.</DialogTitle><DialogDescription>Für diese Demo gilt: Vorschläge vorbereiten, Freigabe abwarten.</DialogDescription>{(Object.keys(enabled) as Suggestion[]).map(k=><div className="rule-row" key={k}><div><strong>{k==="weather"?"Wetter-Agent":k==="return"?"Familien-Agent":"Betriebs-Agent"}</strong><p>{k==="weather"?"Ab 60 % Regenchance oder unter 40 % Auslastung":k==="return"?"Nach 60 Tagen ohne Besuch":"Bei einer Lücke im Schichtbedarf"}</p></div><Switch aria-label={(k==="weather"?"Wetter":k==="return"?"Familien":"Betrieb")+"-Hinweise"} checked={enabled[k]} onCheckedChange={v=>setEnabled(x=>({...x,[k]:v}))}/></div>)}<div className="rule-principles"><p><ShieldCheck size={17}/>Freigabe vor jeder externen Aktion</p><p><Clock3 size={17}/>Mindestens 14 Tage zwischen Kampagnen</p><p><Users size={17}/>Keine Einladungen ab 85 % erwarteter Auslastung</p><p><Mail size={17}/>Nur Kontakte mit passender Freigabe</p></div><button className="button dark" onClick={()=>setRulesOpen(false)}>Fertig</button></DialogContent></Dialog>
 <Dialog open={selectedArticle!==null} onOpenChange={v=>{if(!v)setSelectedArticle(null)}}><DialogContent className="article-dialog" showCloseButton={false}><CloseDialog/><Pill>DEMO-WISSEN</Pill><DialogTitle>{selectedArticle!==null?knowledge[selectedArticle].title:""}</DialogTitle><DialogDescription>Wissenskarte · Stand 29. September 2026</DialogDescription><p>{selectedArticle!==null?knowledge[selectedArticle].text:""}</p><div className="callout blue"><Info size={20}/><p>Diese Regeln illustrieren die Benutzeroberfläche. Sie sind noch keine bestätigten Masulino-Betriebsregeln.</p></div><button className="button dark" onClick={()=>{const t=knowledge[selectedArticle!].title;setSelectedArticle(null);ask(t)}}><Sparkles size={17}/>Masu dazu fragen</button></DialogContent></Dialog>
 <Dialog open={detailBooking!==null} onOpenChange={v=>{if(!v)setDetailBooking(null)}}><DialogContent showCloseButton={false} className="article-dialog"><CloseDialog/>{(()=>{const b=allBookings.find(r=>r.id===detailBooking);return <><Pill>{b?.id}</Pill><DialogTitle>{b?.name}</DialogTitle><DialogDescription>{b?.detail}</DialogDescription><div className="booking-detail"><p><CalendarDays size={18}/>{liveBookings?bookingDayLabel:"Dienstag, 29. September 2026"}</p><p><Clock3 size={18}/>{b?.time} Uhr</p><p><ShieldCheck size={18}/>{liveBookings&&b&&"reference" in b?`${String((b as BookingViewModel).reference)} · ${String((b as BookingViewModel).status)}. Check-in wird nicht gespeichert.`:"Reservierung bestätigt · Demo"}</p></div><JellyButton variant={checkedIn.includes(detailBooking||"")?"soft":"dark"} onClick={()=>{if(detailBooking){setCheckedIn(c=>c.includes(detailBooking)?c.filter(x=>x!==detailBooking):[...c,detailBooking]);setDetailBooking(null)}}}>{checkedIn.includes(detailBooking||"")?"Markierung zurücknehmen":"In dieser Ansicht einchecken"}</JellyButton></>})()}</DialogContent></Dialog>
 <Dialog open={newBooking} onOpenChange={setNewBooking}><DialogContent showCloseButton={false} className="article-dialog"><CloseDialog/><DialogTitle>Eine neue Spielzeit</DialogTitle><DialogDescription>{workspaceReady?"Buchung über den Domain-Service.":"Beispielbuchung für heute, 16 Uhr."}</DialogDescription><form onSubmit={async e=>{e.preventDefault();if(!newName.trim()||bookingBusy)return;if(workspaceReady&&(!newEmail.trim()||!newPhone.trim())){toast("E-Mail und Telefon sind erforderlich.");return;}if(workspaceReady&&livePackages&&livePackages.length>0){setBookingBusy(true);const result=await createBooking({idempotencyKey:idempotencyKey||newIdempotencyKey(),organizerName:newName.trim(),childrenCount:Number(newCount)||1,adultCount:2,packageId:selectedPackageId||livePackages[0]!.id,localTime:"16:00",organizerEmail:newEmail.trim(),organizerPhone:newPhone.trim()});setBookingBusy(false);if(!result.ok){setBookingAlternatives(result.alternatives??[]);toast(result.error==="conflict"?"Kein freier Tisch":result.error==="forbidden"?"Keine Berechtigung":"Buchung fehlgeschlagen",{description:result.alternatives?.join(" · ")});return;}const refreshed=await fetchSectionBookings("bookings");if(refreshed) setLiveBookings(refreshed);setBookingRevision((value)=>value+1);setNewBooking(false);setNewName("");setBookingAlternatives([]);toast("Buchung bestätigt",{description:result.reference});return;}setExtraBookings(b=>[...b,{id:"M-DEMO-"+(b.length+1),time:"16:00",name:newName.trim(),detail:"Familienbesuch · "+newCount+" Gäste",type:"Familie",color:"blue"}]);setNewBooking(false);setNewName("");toast("Demo-Buchung angelegt")}}><label className="field-label">Buchungsname<input required maxLength={60} value={newName} onChange={e=>setNewName(e.target.value)} placeholder="z. B. Familie Beispiel"/></label><label className="field-label">Anzahl Gäste<input type="number" min="1" max="12" required value={newCount} onChange={e=>setNewCount(e.target.value)}/></label>{workspaceReady&&<><label className="field-label">E-Mail<input type="email" required autoComplete="email" value={newEmail} onChange={e=>setNewEmail(e.target.value)}/></label><label className="field-label">Telefon<input required autoComplete="tel" value={newPhone} onChange={e=>setNewPhone(e.target.value)} minLength={3}/></label></>}{workspaceReady&&livePackages&&livePackages.length>0&&<label className="field-label">Paket<select value={selectedPackageId||livePackages[0]!.id} onChange={e=>setSelectedPackageId(e.target.value)}>{livePackages.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>}{bookingAlternatives.length>0&&<div className="callout amber"><Info size={18}/><p>Alternativen: {bookingAlternatives.join(" · ")}</p></div>}<JellyButton className="full-width" type="submit" disabled={bookingBusy}>{bookingBusy?"Wird gespeichert …":workspaceReady?"Buchung anlegen":"Demo-Buchung anlegen"}</JellyButton></form></DialogContent></Dialog>
 <Toaster position="bottom-center" richColors/>
 </SidebarProvider>
}

export default function Home(){
 return <StaffAccess><Workspace/></StaffAccess>
}

function Concept(){return <div className="concept-content"><section className="concept-hero"><span className="eyebrow">DIE PRODUKTIDEE</span><h2>Weniger suchen.<br/>Mehr Spielraum.</h2><p>Ein vertrauter App-Arbeitsplatz, der mitdenkt: Du siehst deinen Betrieb, erkennst Chancen und entscheidest direkt dort, wo der Kontext sichtbar ist.</p><Pill>Designhypothese · September 2026</Pill></section><div className="concept-grid">{[{n:"01",t:"Apps geben Orientierung",p:"Buchungen, Kasse, Familien, Feiern und Team bleiben an einem festen Ort. Prioritäten dürfen sich ändern, die Navigation bleibt verlässlich."},{n:"02",t:"Agenten bereiten vor",p:"Aus Wetter, Nachfrage und Besuchshistorie entsteht ein konkreter Vorschlag mit Zielgruppe, Zeitraum und Entwurf. Du kannst prüfen, ändern oder vertagen."},{n:"03",t:"Antworten werden handhabbar",p:"Masu ergänzt Antworten um Buchungskarten, Kennzahlen und passende Aktionen. Quellen und Datenstand bleiben sichtbar."},{n:"04",t:"Die Entscheidung bleibt bei dir",p:"Kontaktfreigabe, Kapazitätsgrenze und Nachrichtenpause werden vor einer Aktion geprüft. Freigaben und Rücknahmen erscheinen in einer gemeinsamen Aktivität."}].map(x=><article className="surface" key={x.n}><span className="concept-index">{x.n}</span><h3>{x.t}</h3><p>{x.p}</p></article>)}</div><section className="surface research-section"><div className="section-head"><h2>Was aktuelle UX-Technologien ermöglichen</h2><Pill>Recherche · 29.09.2026</Pill></div><ResearchRow name="Agent UX" source="Microsoft Design" href="https://microsoft.design/articles/ux-design-for-agents/" text="Kontextbezogene Hinweise, sichtbare Unsicherheit und nachvollziehbare Kontrolle. Hier umgesetzt als priorisierte Vorschläge mit Begründung und Freigabe."/><ResearchRow name="Generative UI" source="Vercel AI SDK" href="https://ai-sdk.dev/docs/ai-sdk-ui/generative-user-interfaces" text="Tool-Ergebnisse können passende UI-Komponenten erzeugen. Für Masulino: feste, geprüfte Karten für Buchungen, Auslastung und Kampagnen statt beliebig erzeugtem HTML."/><ResearchRow name="A2UI" source="Google Developers" href="https://developers.googleblog.com/introducing-a2ui-an-open-project-for-agent-driven-interfaces/" text="Agenten können Oberflächen als strukturierte Daten aus einem erlaubten Komponenten-Katalog beschreiben. Interessant für mehrere spezialisierte Agenten; ein Kandidat für eine spätere Ausbaustufe."/><ResearchRow name="View Transitions" source="Chrome for Developers" href="https://developer.chrome.com/docs/web-platform/view-transitions" text="Browsergestützte Übergänge können Orientierung bei Kontextwechseln erhalten. Bewegung bleibt zurückhaltend und respektiert reduzierte Bewegung."/><p className="fine-print">Die Technologien wurden recherchiert; der Prototyp simuliert die Agenten lokal und verwendet keinen produktiven KI-, Wetter- oder Kampagnendienst.</p></section><section className="surface"><h2>So könnten die Szenarien zusammenspielen</h2><div className="scenario-notes"><div><CloudRain/><h3>Regen + freie Kapazität</h3><p>Prognose → belegte und spontane Plätze → geeignetes Zeitfenster → passende Kontakte → Entwurf → Freigabe. Kein Rabatt für ohnehin volle Zeiten.</p></div><div><Heart/><h3>Länger nicht besucht</h3><p>Abwesenheit → Kontaktfreigabe → Kampagnenpause → bevorstehende Buchungen → Ausschluss von Überschneidungen → Einladung mit passendem Vorteil.</p></div><div><Users/><h3>Volles Haus</h3><p>Werbung unterdrücken, Besetzung prüfen, Warteliste anbieten. Bei neuer Wetterlage vor dem Versand erneut rechnen.</p></div></div></section><section className="surface"><h2>Vom Prototyp zum ersten Produkt</h2><Table><TableHeader><TableRow><TableHead>Schritt</TableHead><TableHead>Umsetzungsvorschlag</TableHead></TableRow></TableHeader><TableBody><TableRow><TableCell>1 · Verlässliche Basis</TableCell><TableCell>Buchungen, Einlass, Familien und Rollen verbinden; gemeinsamen Datenstand und Quellen zeigen.</TableCell></TableRow><TableRow><TableCell>2 · Assistierter Betrieb</TableCell><TableCell>Wetter und Kapazität auswerten, Wissen abrufen, Kampagnen entwerfen. Freigaben, erneute Prüfung und Aktivitätsprotokoll ergänzen.</TableCell></TableRow><TableRow><TableCell>3 · Kunden-Roadmap</TableCell><TableCell>Webseite, Buchungszugang, Familienkonto und Treuepunkte zusammenführen. Reale Kampagnenergebnisse messen.</TableCell></TableRow></TableBody></Table><p className="fine-print">Kontextgrenze: Die vollständige Architektur aus dem anderen Chat war nicht abrufbar. Buchungszugang, Konto und Treuepunkte stammen aus der sichtbaren Projektzusammenfassung; weitere Module und Regeln sind Designvorschläge.</p></section><div className="info-inline"><RotateCcw size={18}/>Demo-Änderungen gelten in dieser Sitzung. Beim Neuladen beginnt der Prototyp wieder mit den Ausgangsdaten.</div></div>}
function ResearchRow({name,source,href,text}:{name:string;source:string;href:string;text:string}){return <div className="research-row"><div><h3>{name}</h3><a href={href} target="_blank" rel="noopener noreferrer">{source}<ExternalLink size={13}/></a></div><p>{text}</p></div>}
