// Demo café "קפה לימון": a believable, fully populated business so every
// screen has something to show. Everything is generated relative to DEMO_DATE
// and seeded, so each recording sees exactly the same data.

/** The day the demo "happens" — a Tuesday, mid-week, so the schedule is full. */
export const DEMO_DATE = "2026-10-20";
/** Wall-clock time the browser starts at (Asia/Jerusalem). */
export const DEMO_TIME = "08:52";

export const BIZ = "b0000000-0000-4000-8000-000000000001";

const uid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Israel is UTC+3 until the last Sunday of October, UTC+2 after. */
const tzOffset = (date) => (date >= "2026-10-25" && date < "2027-03-26" ? "+02:00" : "+03:00");
export const ts = (date, hhmm) => new Date(`${date}T${hhmm}:00${tzOffset(date)}`).toISOString();

export function addDays(iso, n) {
  const d = new Date(iso + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
const dow = (iso) => new Date(iso + "T12:00:00Z").getUTCDay();
const weekStartOf = (iso) => addDays(iso, -dow(iso));

const CREATED = "2026-06-01T09:00:00.000Z";

export const DEPT = { kitchen: uid(101), bar: uid(102), floor: uid(103) };
export const USERS = {
  noa: uid(1), // the employee every worker video follows
  avi: uid(2), // owner / manager
  yossi: uid(3),
  shira: uid(4),
  daniel: uid(5),
  maya: uid(6),
  omer: uid(7),
  tamar: uid(8),
  eitan: uid(9),
  lior: uid(10),
  roni: uid(11),
  moshe: uid(12),
};
export const SHIFT = {
  floorMorning: uid(201),
  floorEvening: uid(202),
  kitchenMorning: uid(203),
  kitchenEvening: uid(204),
  barEvening: uid(205),
};

const PEOPLE = [
  // id, name, role, dept, wage, rate, email, birth
  ["noa", "נועה כהן", "employee", "floor", "tips", 35, "noa@lemon-cafe.demo", "2001-03-14"],
  ["avi", "אבי מזרחי", "manager", null, "hourly", 0, "avi@lemon-cafe.demo", "1984-07-02"],
  ["yossi", "יוסי אברהם", "department_manager", "kitchen", "hourly", 58, "yossi@lemon-cafe.demo", "1990-01-22"],
  ["shira", "שירה לוי", "shift_manager", "floor", "hourly", 48, "shira@lemon-cafe.demo", "1996-10-20"],
  ["daniel", "דניאל פרץ", "employee", "kitchen", "hourly", 42, "daniel@lemon-cafe.demo", "1999-05-30"],
  ["maya", "מאיה ביטון", "employee", "bar", "tips", 35, "maya@lemon-cafe.demo", "2000-12-08"],
  ["omer", "עומר דהן", "employee", "kitchen", "hourly", 40, "omer@lemon-cafe.demo", "2002-08-17"],
  ["tamar", "תמר אוחיון", "employee", "floor", "tips", 35, "tamar@lemon-cafe.demo", "2003-02-11"],
  ["eitan", "איתן גבאי", "employee", "bar", "tips", 35, "eitan@lemon-cafe.demo", "1998-04-25"],
  ["lior", "ליאור חדד", "employee", "floor", "tips", 35, "lior@lemon-cafe.demo", "2002-11-03"],
  ["roni", "רוני אלון", "office_manager", null, "hourly", 52, "roni@lemon-cafe.demo", "1988-09-09"],
  ["moshe", "משה שלום", "maintenance", null, "hourly", 60, "moshe@lemon-cafe.demo", "1979-06-15"],
];

/** Who works which shifts, and how many per week. */
const ROTA = {
  noa: { shifts: ["floorMorning", "floorEvening"], perWeek: 5 },
  shira: { shifts: ["floorMorning", "floorEvening"], perWeek: 5 },
  tamar: { shifts: ["floorMorning", "floorEvening"], perWeek: 4 },
  lior: { shifts: ["floorEvening", "floorMorning"], perWeek: 4 },
  yossi: { shifts: ["kitchenMorning"], perWeek: 5 },
  daniel: { shifts: ["kitchenMorning", "kitchenEvening"], perWeek: 5 },
  omer: { shifts: ["kitchenEvening", "kitchenMorning"], perWeek: 4 },
  maya: { shifts: ["barEvening"], perWeek: 4 },
  eitan: { shifts: ["barEvening"], perWeek: 4 },
};

/** Noa's own week is hand-picked so the videos read well: she works this morning. */
const NOA_WEEK = { 0: "floorMorning", 2: "floorMorning", 3: "floorEvening", 5: "floorMorning", 6: "floorEvening" };

const SHIFT_HOURS = {
  floorMorning: ["08:00", "16:00"],
  floorEvening: ["16:00", "23:30"],
  kitchenMorning: ["07:00", "15:00"],
  kitchenEvening: ["15:00", "23:00"],
  barEvening: ["18:00", "01:30"],
};

export function buildDemoData() {
  const r = rng(20261020);
  const t = {};

  t.businesses = [
    {
      id: BIZ,
      name: "קפה לימון",
      active: true,
      plan: "full",
      max_users: 30,
      admin_notes: null,
      location_lat: 32.0809,
      location_lng: 34.7806,
      location_address: "דיזנגוף 120, תל אביב",
      location_radius_m: 150,
      attendance_geofence_enabled: false,
      attendance_geofence_exempt_roles: [],
      maintenance_task_approval: false,
      shift_prefs_deadline_dow: 4,
      shift_prefs_deadline_time: "20:00:00",
      shift_prefs_open_dow: null,
      shift_prefs_open_time: null,
      shift_prefs_min_weekdays: 2,
      shift_prefs_min_weekend: 1,
      created_by: USERS.avi,
      created_at: CREATED,
      updated_at: CREATED,
    },
  ];

  t.business_features = ["agreements", "shifts", "shift_reports", "payroll", "attendance", "inventory", "waste", "menu", "faults", "events", "tasks"].map(
    (k, i) => ({ id: uid(900 + i), business_id: BIZ, feature_key: k, enabled: true }),
  );

  t.departments = [
    { id: DEPT.floor, business_id: BIZ, name: "שירות", color: "#0ea5e9", sort_order: 0, active: true, created_at: CREATED },
    { id: DEPT.kitchen, business_id: BIZ, name: "מטבח", color: "#f97316", sort_order: 1, active: true, created_at: CREATED },
    { id: DEPT.bar, business_id: BIZ, name: "בר", color: "#a855f7", sort_order: 2, active: true, created_at: CREATED },
  ];

  t.profiles = PEOPLE.map(([key, name, role, dept, wage, rate, email, birth]) => ({
    id: USERS[key],
    business_id: BIZ,
    department_id: dept ? DEPT[dept] : null,
    full_name: name,
    avatar_url: null,
    email,
    phone: `05${Math.floor(r() * 9)}-${String(Math.floor(1000000 + r() * 8999999))}`,
    role,
    hourly_rate: rate || null,
    wage_type: wage,
    bonus_pct: 0,
    pension_active: true,
    birth_date: birth,
    active: true,
    created_at: CREATED,
    updated_at: CREATED,
  }));

  t.employee_positions = [];
  let posN = 300;
  for (const [key, , role, dept, wage, rate] of PEOPLE) {
    if (role === "manager") continue;
    t.employee_positions.push({
      id: uid(posN++),
      business_id: BIZ,
      employee_id: USERS[key],
      role,
      department_id: dept ? DEPT[dept] : null,
      wage_type: wage,
      hourly_rate: rate,
      bonus_pct: 0,
      sort_order: 0,
      created_at: CREATED,
      updated_at: CREATED,
    });
  }
  // Noa also covers the bar on hourly pay — clocking in asks which job she is working.
  t.employee_positions.push({
    id: uid(posN++),
    business_id: BIZ,
    employee_id: USERS.noa,
    role: "employee",
    department_id: DEPT.bar,
    wage_type: "hourly",
    hourly_rate: 42,
    bonus_pct: 0,
    sort_order: 1,
    created_at: CREATED,
    updated_at: CREATED,
  });

  const tplRow = (key, name, dept, shiftKey, sort) => ({
    id: SHIFT[key],
    business_id: BIZ,
    department_id: DEPT[dept],
    shift_key: shiftKey,
    name,
    start_time: SHIFT_HOURS[key][0],
    end_time: SHIFT_HOURS[key][1],
    color: null,
    active: true,
    sort_order: sort,
    created_at: CREATED,
  });
  t.shift_templates = [
    tplRow("floorMorning", "בוקר", "floor", "morning", 0),
    tplRow("floorEvening", "ערב", "floor", "evening", 1),
    tplRow("kitchenMorning", "בוקר", "kitchen", "morning", 2),
    tplRow("kitchenEvening", "ערב", "kitchen", "evening", 3),
    tplRow("barEvening", "ערב", "bar", "evening", 4),
  ];
  t.shift_template_days = [];

  // ---- schedule + attendance + tips -------------------------------------------------
  t.shift_assignments = [];
  t.attendance = [];
  t.tips = [];
  t.shift_reports = [];
  const posOf = (empId) => t.employee_positions.find((p) => p.employee_id === empId && p.sort_order === 0);

  const firstWeek = addDays(weekStartOf(DEMO_DATE), -7 * 7);
  const lastWeek = addDays(weekStartOf(DEMO_DATE), 7);
  let aN = 10000;
  for (let wk = firstWeek; wk <= lastWeek; wk = addDays(wk, 7)) {
    for (const [key, rota] of Object.entries(ROTA)) {
      let days;
      if (key === "noa" && wk === weekStartOf(DEMO_DATE)) days = Object.keys(NOA_WEEK).map(Number);
      else {
        const pool = [0, 1, 2, 3, 4, 5, 6].sort(() => r() - 0.5);
        days = pool.slice(0, rota.perWeek).sort();
      }
      for (const d of days) {
        const date = addDays(wk, d);
        const shiftKey =
          key === "noa" && wk === weekStartOf(DEMO_DATE) ? NOA_WEEK[d] : rota.shifts[r() < 0.7 ? 0 : rota.shifts.length - 1];
        const empId = USERS[key];
        t.shift_assignments.push({
          id: uid(aN++),
          business_id: BIZ,
          department_id: t.shift_templates.find((s) => s.id === SHIFT[shiftKey]).department_id,
          employee_id: empId,
          shift_date: date,
          shift_template_id: SHIFT[shiftKey],
          assigned_by: USERS.avi,
          created_at: ts(addDays(wk, -2), "12:00"),
        });

        // Past shifts were worked; today's morning crew is already in (Noa is about to punch).
        const [start, end] = SHIFT_HOURS[shiftKey];
        const jitter = (m) => {
          const [h, mm] = start.split(":").map(Number);
          const total = h * 60 + mm + m;
          return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
        };
        const inTime = jitter(Math.floor(r() * 12) - 8);
        if (date < DEMO_DATE) {
          const [eh, em] = end.split(":").map(Number);
          const overnight = eh < 6;
          const outDate = overnight ? addDays(date, 1) : date;
          const outMin = eh * 60 + em + Math.floor(r() * 20) - 5;
          const outTime = `${String(Math.floor(outMin / 60)).padStart(2, "0")}:${String(((outMin % 60) + 60) % 60).padStart(2, "0")}`;
          const clockIn = ts(date, inTime);
          const clockOut = ts(outDate, outTime);
          t.attendance.push({
            id: uid(aN++),
            business_id: BIZ,
            employee_id: empId,
            clock_in: clockIn,
            clock_out: clockOut,
            clock_in_lat: 32.0809,
            clock_in_lng: 34.7806,
            within_radius: true,
            position_id: posOf(empId)?.id ?? null,
            created_at: clockIn,
          });
          const p = t.profiles.find((x) => x.id === empId);
          if (p.wage_type === "tips") {
            const hours = Math.round(((Date.parse(clockOut) - Date.parse(clockIn)) / 36e5) * 100) / 100;
            const hourly = Math.round(48 + r() * 30);
            t.tips.push({
              id: uid(aN++),
              business_id: BIZ,
              employee_id: empId,
              shift_date: date,
              shift_template_id: SHIFT[shiftKey],
              amount: Math.round(hours * hourly),
              hours,
              hourly_from_tips: hourly,
              shift_report_id: null,
              position_id: posOf(empId)?.id ?? null,
              created_at: clockOut,
            });
          }
        } else if (date === DEMO_DATE && start <= "08:00" && key !== "noa") {
          const clockIn = ts(date, inTime);
          t.attendance.push({
            id: uid(aN++),
            business_id: BIZ,
            employee_id: empId,
            clock_in: clockIn,
            clock_out: null,
            clock_in_lat: 32.0809,
            clock_in_lng: 34.7806,
            within_radius: true,
            position_id: posOf(empId)?.id ?? null,
            created_at: clockIn,
          });
        }
      }
    }
  }

  // The demo morning always has a full crew in (Noa is the one about to punch).
  const MORNING_CREW = [["yossi", "kitchenMorning", "06:58"], ["daniel", "kitchenMorning", "06:54"], ["shira", "floorMorning", "07:58"], ["tamar", "floorMorning", "07:55"], ["omer", "kitchenMorning", "07:03"]];
  for (const [key, shiftKey, inTime] of MORNING_CREW) {
    const empId = USERS[key];
    if (!t.shift_assignments.some((a) => a.employee_id === empId && a.shift_date === DEMO_DATE)) {
      t.shift_assignments.push({
        id: uid(aN++),
        business_id: BIZ,
        department_id: t.shift_templates.find((x) => x.id === SHIFT[shiftKey]).department_id,
        employee_id: empId,
        shift_date: DEMO_DATE,
        shift_template_id: SHIFT[shiftKey],
        assigned_by: USERS.avi,
        created_at: ts(addDays(DEMO_DATE, -4), "12:00"),
      });
    }
    if (!t.attendance.some((a) => a.employee_id === empId && a.clock_in.startsWith(DEMO_DATE.slice(0, 8)) && !a.clock_out)) {
      t.attendance.push({
        id: uid(aN++),
        business_id: BIZ,
        employee_id: empId,
        clock_in: ts(DEMO_DATE, inTime),
        clock_out: null,
        clock_in_lat: 32.0809,
        clock_in_lng: 34.7806,
        within_radius: true,
        position_id: posOf(empId)?.id ?? null,
        created_at: ts(DEMO_DATE, inTime),
      });
    }
  }

  // End-of-shift reports for every past morning and evening — they drive revenue and tips.
  let rN = 40000;
  for (let date = addDays(DEMO_DATE, -55); date < DEMO_DATE; date = addDays(date, 1)) {
    for (const [key, base] of [["floorMorning", 7200], ["floorEvening", 10400]]) {
      const weekend = dow(date) >= 4;
      const sales = Math.round((base * (weekend ? 1.35 : 1) + r() * 2600) / 10) * 10;
      const tips = Math.round(sales * (0.09 + r() * 0.03));
      t.shift_reports.push({
        id: uid(rN++),
        business_id: BIZ,
        report_date: date,
        shift_template_id: SHIFT[key],
        manager_names: "שירה לוי",
        total_sales: sales,
        delivery_sales: Math.round(sales * 0.12),
        avg_per_diner: Math.round(68 + r() * 22),
        total_tips: tips,
        service_pct: 0,
        tips_hourly: Math.round(52 + r() * 24),
        first_release: null,
        energy_level: 4,
        unusual_events: null,
        team_talks: null,
        team_voice: null,
        daily_tasks_done: true,
        urgent_inventory: null,
        faults_maintenance: null,
        extra: { manager_ids: [USERS.shira] },
        invoice_urls: [],
        created_by: USERS.shira,
        created_at: ts(date, key === "floorMorning" ? "16:20" : "23:50"),
        updated_at: ts(date, key === "floorMorning" ? "16:20" : "23:50"),
      });
    }
  }

  // Noa covered two bar evenings this month on her hourly bar position.
  const noaBar = t.employee_positions.find((p) => p.employee_id === USERS.noa && p.sort_order === 1);
  for (const date of ["2026-10-07", "2026-10-14"]) {
    t.shift_assignments.push({
      id: uid(aN++),
      business_id: BIZ,
      department_id: DEPT.bar,
      employee_id: USERS.noa,
      shift_date: date,
      shift_template_id: SHIFT.barEvening,
      assigned_by: USERS.avi,
      created_at: ts(addDays(date, -5), "12:00"),
    });
    t.attendance.push({
      id: uid(aN++),
      business_id: BIZ,
      employee_id: USERS.noa,
      clock_in: ts(date, "17:56"),
      clock_out: ts(addDays(date, 1), "01:12"),
      clock_in_lat: 32.0809,
      clock_in_lng: 34.7806,
      within_radius: true,
      position_id: noaBar.id,
      created_at: ts(date, "17:56"),
    });
  }

  // ---- availability: the team has started filling next week; Noa hasn't yet ----------
  const nextWeek = addDays(weekStartOf(DEMO_DATE), 7);
  t.shift_preferences = [];
  for (const key of ["shira", "tamar", "daniel", "maya"]) {
    for (let d = 0; d < 7; d++) {
      const shiftKey = ROTA[key].shifts[0];
      const v = r();
      t.shift_preferences.push({
        id: uid(aN++),
        business_id: BIZ,
        employee_id: USERS[key],
        week_start: nextWeek,
        shift_date: addDays(nextWeek, d),
        shift_template_id: SHIFT[shiftKey],
        preference: v < 0.4 ? "prefer" : v < 0.8 ? "available" : "cannot",
        note: null,
        created_at: ts(DEMO_DATE, "07:30"),
      });
    }
  }

  // ---- tasks ---------------------------------------------------------------------------
  const tpl = (n, dept, title, description, days, sort) => ({
    id: uid(n),
    business_id: BIZ,
    department_id: dept ? DEPT[dept] : null,
    title,
    description,
    recurrence_weekday: days,
    active: true,
    sort_order: sort,
    created_at: CREATED,
  });
  t.task_templates = [
    tpl(401, "floor", "פתיחת מרפסת וסידור שולחנות", "להוריד כיסאות, לנגב שולחנות ולהציב מפות", [-1], 0),
    tpl(402, "floor", "מילוי תחנת מלצרים", "סכו״ם, מפיות, קשים ותפריטים", [-1], 1),
    tpl(403, "floor", "ניקוי ויטרינת עוגות", null, [0, 2, 4], 2),
    tpl(404, "kitchen", "בדיקת טמפרטורות מקררים", "לרשום טמפרטורה בכל מקרר", [-1], 0),
    tpl(405, "kitchen", "בדיקת תאריכי תפוגה", null, [0, 3], 1),
    tpl(406, "bar", "ניקוי מכונת קפה", "שטיפת ראשים וניקוי מקציף", [-1], 0),
    tpl(407, null, "הוצאת זבל ומחזור בסוף משמרת", null, [-1], 5),
  ];
  t.tasks = [
    {
      id: uid(451),
      business_id: BIZ,
      template_id: null,
      event_id: null,
      department_id: null,
      title: "להכין שלט גיר למנת היום",
      description: "שקשוקה פיקנטית עם פטה — 54 ₪",
      type: "one_time",
      assigned_to: USERS.noa,
      assigned_by: USERS.shira,
      due_date: DEMO_DATE,
      recurrence_weekday: null,
      status: "open",
      approval_status: null,
      photo_url: null,
      media_urls: [],
      completed_at: null,
      last_documented_by: null,
      last_documented_at: null,
      created_at: ts(addDays(DEMO_DATE, -1), "18:20"),
      updated_at: ts(addDays(DEMO_DATE, -1), "18:20"),
    },
    {
      id: uid(452),
      business_id: BIZ,
      template_id: null,
      event_id: null,
      department_id: null,
      title: "לקפל 60 מפיות לאירוע ביום חמישי",
      description: null,
      type: "one_time",
      assigned_to: USERS.noa,
      assigned_by: USERS.avi,
      due_date: DEMO_DATE,
      recurrence_weekday: null,
      status: "open",
      approval_status: null,
      photo_url: null,
      media_urls: [],
      completed_at: null,
      last_documented_by: null,
      last_documented_at: null,
      created_at: ts(addDays(DEMO_DATE, -1), "12:05"),
      updated_at: ts(addDays(DEMO_DATE, -1), "12:05"),
    },
  ];

  // ---- inventory -------------------------------------------------------------------------
  const catRow = (n, name, sort) => ({ id: uid(n), business_id: BIZ, name, color: null, sort_order: sort, active: true, created_at: CREATED });
  t.inventory_categories = [catRow(501, "חלב ומקרר", 0), catRow(502, "קפה ושתייה", 1), catRow(503, "יבשים", 2), catRow(504, "חד-פעמי וניקיון", 3)];
  const unitRow = (n, name, kind, sort) => ({ id: uid(n), business_id: BIZ, name, sort_order: sort, is_base: kind === "single", kind, active: true, created_at: CREATED });
  t.inventory_units = [
    unitRow(511, "יחידה", "single", 0),
    unitRow(512, "בקבוק", "single", 1),
    unitRow(513, "קרטון", "package", 2),
    unitRow(514, "ארגז", "package", 3),
    unitRow(515, "ק״ג", "measure", 4),
    unitRow(516, "ליטר", "measure", 5),
    unitRow(517, "שק", "single", 6),
  ];
  t.warehouses = [
    { id: uid(521), business_id: BIZ, name: "מחסן ראשי", sort_order: 0, is_default: true, active: true, created_at: CREATED },
    { id: uid(522), business_id: BIZ, name: "מקרר בר", sort_order: 1, is_default: false, active: true, created_at: CREATED },
  ];
  const ITEMS = [
    // name, cat, unit, perPkg, piece, min, qty
    ["חלב 3%", 501, "ליטר", null, null, 20, 34],
    ["חלב שיבולת שועל", 501, "קרטון", 6, "בקבוק", 3, 2],
    ["שמנת מתוקה", 501, "ליטר", null, null, 5, 7],
    ["גבינת פטה", 501, "ק״ג", null, null, 3, 4],
    ["ביצים", 501, "קרטון", 30, "יחידה", 4, 6],
    ["פולי קפה אספרסו", 502, "ק״ג", null, null, 6, 9],
    ["סירופ וניל", 502, "בקבוק", null, null, 2, 1],
    ["מים מינרליים", 502, "ארגז", 24, "בקבוק", 3, 5],
    ["לימונים", 502, "ק״ג", null, null, 4, 6],
    ["קמח לבן", 503, "שק", null, null, 2, 3],
    ["סוכר", 503, "ק״ג", null, null, 5, 11],
    ["שיבולת שועל", 503, "ק״ג", null, null, 2, 1],
    ["כוסות נייר 8oz", 504, "קרטון", 50, "יחידה", 4, 7],
    ["מפיות", 504, "קרטון", 500, "יחידה", 2, 3],
    ["נוזל כלים", 504, "בקבוק", null, null, 3, 4],
  ];
  t.inventory_items = [];
  t.inventory_counts = [];
  t.inventory_logs = [];
  t.inventory_item_departments = [];
  ITEMS.forEach(([name, cat, unit, perPkg, piece, min, qty], i) => {
    const id = uid(600 + i);
    t.inventory_items.push({
      id,
      business_id: BIZ,
      name,
      barcode: null,
      unit,
      units_per_package: perPkg,
      piece_unit: piece,
      content_qty: null,
      content_measure: null,
      image_url: null,
      min_quantity: min,
      category_id: uid(cat),
      active: true,
      created_at: CREATED,
    });
    const counted = ts(addDays(DEMO_DATE, -1 - (i % 3)), `${String(17 + (i % 5)).padStart(2, "0")}:${String(10 + i * 3).padStart(2, "0")}`);
    const who = [USERS.shira, USERS.daniel, USERS.maya][i % 3];
    t.inventory_counts.push({ id: uid(700 + i), business_id: BIZ, item_id: id, warehouse_id: uid(521), employee_id: who, quantity: qty, counted_at: counted });
    t.inventory_logs.push({
      id: uid(750 + i),
      business_id: BIZ,
      item_id: id,
      warehouse_id: uid(521),
      employee_id: who,
      action: "count",
      previous_qty: qty + 2,
      new_qty: qty,
      note: null,
      created_at: counted,
    });
  });
  t.inventory = [];
  t.inventory_waste = [];

  t.suppliers = [
    { id: uid(801), business_id: BIZ, name: "תנובה", phone: "03-5551234", tax_id: null, notes: null, delivery_days: [0, 3], order_days: [6, 2], active: true, created_at: CREATED, updated_at: CREATED },
    { id: uid(802), business_id: BIZ, name: "קפה גרגר", phone: "03-5559876", tax_id: null, notes: null, delivery_days: [1], order_days: [0], active: true, created_at: CREATED, updated_at: CREATED },
    { id: uid(803), business_id: BIZ, name: "סיטונאות הדר", phone: "04-5554321", tax_id: null, notes: null, delivery_days: [4], order_days: [2], active: true, created_at: CREATED, updated_at: CREATED },
  ];
  // Price lists: dairy from תנובה, coffee from קפה גרגר, the rest from the wholesaler.
  const PRICES = [14.9, 72, 21, 58, 36, 92, 34, 39, 9.5, 46, 6.2, 11, 48, 55, 17];
  t.supplier_items = t.inventory_items.map((item, i) => ({
    business_id: BIZ,
    supplier_id: i < 5 ? uid(801) : i < 7 ? uid(802) : uid(803),
    item_id: item.id,
    unit_price: PRICES[i],
    price_unit: "main",
    created_at: CREATED,
    updated_at: CREATED,
  }));
  // Last week's dairy order, already delivered.
  const batch = uid(950);
  t.inventory_orders = [0, 2, 3, 4].map((idx, k) => ({
    id: uid(951 + k),
    business_id: BIZ,
    item_id: t.inventory_items[idx].id,
    quantity: [30, 6, 4, 5][k],
    received_quantity: [30, 6, 4, 5][k],
    status: "received",
    ordered_by: USERS.avi,
    batch_id: batch,
    supplier_id: uid(801),
    created_at: ts(addDays(DEMO_DATE, -8), "10:30"),
  }));

  // ---- events, salary issues, documents --------------------------------------------------
  t.events = [
    {
      id: uid(851),
      business_id: BIZ,
      title: "ערב ג׳אז חי",
      description: "הרכב של שלושה נגנים, מ־20:00. תפריט טאפאס מצומצם.",
      event_date: addDays(DEMO_DATE, 2),
      media_urls: [],
      created_by: USERS.avi,
      created_at: ts(addDays(DEMO_DATE, -6), "11:00"),
    },
    {
      id: uid(852),
      business_id: BIZ,
      title: "ארוחת צוות של חברת הייטק",
      description: "40 סועדים, סגירת המרפסת מ־13:00 עד 15:30.",
      event_date: addDays(DEMO_DATE, 8),
      media_urls: [],
      created_by: USERS.avi,
      created_at: ts(addDays(DEMO_DATE, -3), "15:20"),
    },
  ];
  t.event_requests = [];
  t.event_ideas = [];

  t.salary_issues = [
    {
      id: uid(862),
      business_id: BIZ,
      employee_id: USERS.tamar,
      category: "missing_tips",
      description: "במשמרת בוקר ב־15/10 הטיפים שלי נראים נמוכים מהשאר, עבדתי 8 שעות מלאות.",
      status: "open",
      status_updated_by: null,
      status_updated_at: null,
      created_at: ts(addDays(DEMO_DATE, -1), "21:05"),
      updated_at: ts(addDays(DEMO_DATE, -1), "21:05"),
    },
    {
      id: uid(861),
      business_id: BIZ,
      employee_id: USERS.noa,
      category: "wrong_hours",
      description: "ביום שישי ה־2/10 שכחתי להחתים יציאה, יצאתי ב־16:10.",
      status: "closed",
      status_updated_by: USERS.roni,
      status_updated_at: ts("2026-10-04", "10:15"),
      created_at: ts("2026-10-03", "09:40"),
      updated_at: ts("2026-10-04", "10:15"),
    },
  ];

  const agreement = (n, type, title, content, created) => ({
    id: uid(n),
    business_id: BIZ,
    type,
    title,
    content,
    file_url: null,
    signature_fields: [],
    employee_id: null,
    is_editable: false,
    created_by: USERS.avi,
    created_at: created,
    updated_at: created,
  });
  t.agreement_templates = [
    agreement(
      871,
      "work",
      "הסכם העסקה — קפה לימון",
      [
        "העובד/ת מועסק/ת בקפה לימון במשרה חלקית לפי סידור עבודה שבועי.",
        "השכר משולם עד ה־9 בכל חודש עבור החודש הקודם.",
        "החתמת כניסה ויציאה נעשית באפליקציה בתחילת ובסוף כל משמרת.",
        "הודעה מוקדמת על סיום העסקה תינתן בהתאם לחוק.",
      ].join("\n"),
      CREATED,
    ),
    agreement(
      872,
      "sexual_harassment",
      "תקנון מניעת הטרדה מינית",
      [
        "קפה לימון מחויב לסביבת עבודה בטוחה ומכבדת לכל העובדים.",
        "הטרדה מינית והתנכלות אסורות על פי חוק ומהוות עבירת משמעת.",
        "האחראית על הטיפול בתלונות: רוני אלון, מנהלת המשרד.",
        "אפשר לפנות אליה בכל עת, והפנייה תטופל בדיסקרטיות.",
      ].join("\n"),
      ts(addDays(DEMO_DATE, -2), "10:00"),
    ),
  ];
  // Most of the team signed the contract on day one; the policy is newer.
  const signed = (n, agreementId, who, date) => ({
    id: uid(n),
    business_id: BIZ,
    agreement_id: agreementId,
    employee_id: USERS[who],
    agreed: true,
    signature_data: null,
    field_signatures: {},
    signed_file_url: null,
    signed_at: ts(date, "11:20"),
    email_notified_at: null,
    created_at: ts(date, "11:20"),
  });
  t.agreement_signatures = [
    ...["yossi", "shira", "daniel", "maya", "tamar", "eitan", "roni", "moshe"].map((w, i) => signed(1100 + i, uid(871), w, "2026-06-03")),
    ...["yossi", "shira", "daniel", "roni"].map((w, i) => signed(1120 + i, uid(872), w, addDays(DEMO_DATE, -1))),
    {
      id: uid(881),
      business_id: BIZ,
      agreement_id: uid(871),
      employee_id: USERS.noa,
      agreed: true,
      signature_data: null,
      field_signatures: {},
      signed_file_url: null,
      signed_at: ts("2026-06-03", "11:20"),
      email_notified_at: null,
      created_at: ts("2026-06-03", "11:20"),
    },
  ];
  t.employee_id_cards = [];
  const fault = (n, description, status, reporter, daysAgo, extra = {}) => ({
    id: uid(n),
    business_id: BIZ,
    reported_by: reporter,
    photo_urls: [],
    description,
    status,
    assigned_to: null,
    status_updated_by: null,
    status_updated_at: null,
    work_price: null,
    pay_employee_id: null,
    pay_approval_status: null,
    pay_submitted_at: null,
    pay_approved_by: null,
    pay_approved_at: null,
    created_at: ts(addDays(DEMO_DATE, -daysAgo), "18:40"),
    updated_at: ts(addDays(DEMO_DATE, -daysAgo), "18:40"),
    ...extra,
  });
  t.faults = [
    fault(891, "המקרר בבר מטפטף מים מלמטה", "needs_handling", USERS.maya, 1),
    fault(892, "נורה שרופה מעל שולחן 6 במרפסת", "in_progress", USERS.shira, 3, {
      assigned_to: USERS.moshe,
      status_updated_by: USERS.moshe,
      status_updated_at: ts(addDays(DEMO_DATE, -2), "09:15"),
    }),
    fault(893, "הידית בדלת השירותים רופפת", "handled", USERS.lior, 9, {
      assigned_to: USERS.moshe,
      status_updated_by: USERS.moshe,
      status_updated_at: ts(addDays(DEMO_DATE, -8), "11:00"),
    }),
  ];
  t.shift_bonuses = [];
  t.payroll_month_adjustments = [];
  t.office_receipts = [];
  t.invoices = [];
  t.recurring_orders = [];
  t.recurring_order_items = [];
  t.menu_categories = [];
  t.menu_dishes = [];
  t.menu_dish_components = [];
  t.menu_dish_sales = [];
  t.menu_item_conversions = [];
  t.menu_settings = [];
  t.menu = [];
  t.avatars = [];

  return t;
}
