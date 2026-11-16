export type PosRole =
  | "paying_child"
  | "free_baby"
  | "adult"
  | "party"
  | "food"
  | "drink"
  | "kiosk"
  | "chip"
  | "group"
  | "ignore";

export type PosGroup = "eintritt" | "gastro" | "geburtstag" | "chips" | "sonstiges";

export type ProductClass = {
  role: PosRole;
  groupKey: PosGroup;
  countInQuantity: boolean;
  countInRevenue: boolean;
};

function classified(role: PosRole, groupKey: PosGroup, countInQuantity = true, countInRevenue = true): ProductClass {
  return { role, groupKey, countInQuantity, countInRevenue };
}

function isFreeBaby(category: string, productName: string): boolean {
  if (category === "Eintritt Baby (frei)") return true;
  return /kind\s*0|unter\s*1|baby unter/i.test(productName);
}

export function classifyProduct(category: string, productName: string): ProductClass {
  const name = productName.trim();
  if (/^pager\b/i.test(name)) return classified("ignore", "gastro", false, false);
  if (isFreeBaby(category, name)) return classified("free_baby", "eintritt", false, false);
  if (category === "Eintritt Happy Hour") {
    return /kind/i.test(name)
      ? classified("paying_child", "eintritt")
      : classified("adult", "eintritt");
  }
  if (category === "Eintritt Kind") {
    return /erw/i.test(name) ? classified("adult", "eintritt") : classified("paying_child", "eintritt");
  }
  if (category === "Eintritt Erwachsene") return classified("adult", "eintritt");
  if (category === "Gruppen (Kita/Schule)") return classified("group", "eintritt");
  if (category === "Geburtstag") return classified("party", "geburtstag");
  if (category === "Gastro Speisen") return classified("food", "gastro");
  if (category === "Gastro Getränke") return classified("drink", "gastro");
  if (category === "Gastro Kiosk") return classified("kiosk", "gastro");
  if (category === "Chips/Extra") return classified("chip", "chips");
  return classified("ignore", "sonstiges", true, true);
}
