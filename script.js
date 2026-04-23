/* =========================================================
   New Heights Aquatics — Scheduler + Registration (client-side)
   - Renders a month calendar, enforces business days/hours
   - Shows time slots based on lesson type
   - Collects registration details and triggers a placeholder
     payment action (ready to be wired to Stripe/PayPal/Square)
   ========================================================= */

(function () {
  "use strict";

  // ---------- Mobile nav toggle ----------
  const toggle = document.querySelector(".nav-toggle");
  const links = document.querySelector(".nav-links");
  if (toggle && links) {
    toggle.addEventListener("click", () => links.classList.toggle("open"));
  }

  // ---------- Tabs (program info) ----------
  document.querySelectorAll("[data-tabs]").forEach((root) => {
    const btns = root.querySelectorAll(".tab-btn");
    const panels = root.querySelectorAll(".tab-panel");
    btns.forEach((btn) => {
      btn.addEventListener("click", () => {
        const target = btn.dataset.tab;
        btns.forEach((b) => b.classList.toggle("active", b === btn));
        panels.forEach((p) => p.classList.toggle("active", p.dataset.tab === target));
      });
    });
  });

  // ---------- Scheduler ----------
  const schedulers = document.querySelectorAll("[data-scheduler]");
  schedulers.forEach(initScheduler);

  function initScheduler(root) {
    // Program configuration pulled from data attributes on the page
    const programs = JSON.parse(root.dataset.programs || "[]");
    if (!programs.length) return;

    // Optional per-scheduler hours override. Keys are day-of-week 0..6 (Sun..Sat),
    // values are [startHour, endHour] or null (closed). Defaults to lesson hours.
    const defaultHours = {
      0: null,      // Sun closed
      1: [16, 20],  // Mon 4-8pm
      2: [16, 20],
      3: [16, 20],
      4: [16, 20],
      5: [15, 19],  // Fri
      6: [9, 14],   // Sat 9am-2pm
    };
    let customHours = null;
    try { customHours = root.dataset.hours ? JSON.parse(root.dataset.hours) : null; } catch (e) { customHours = null; }
    const hoursByDow = customHours || defaultHours;

    // Optional preselect via ?program=<id> in the URL
    let initialProgramId = programs[0].id;
    try {
      const params = new URLSearchParams(location.search);
      const pre = params.get("program");
      if (pre && programs.some((p) => p.id === pre)) initialProgramId = pre;
    } catch (e) { /* no-op */ }

    let state = {
      programId: initialProgramId,
      viewMonth: startOfMonth(new Date()),
      selectedDate: null,
      selectedTime: null,
    };

    // --- grab nodes ---
    const pillRoot = root.querySelector("[data-pills]");
    const calRoot = root.querySelector("[data-calendar]");
    const slotRoot = root.querySelector("[data-slots]");
    const slotLabel = root.querySelector("[data-slot-label]");
    const summary = root.querySelector("[data-summary]");
    const form = root.querySelector("[data-form]");
    const submitBtn = form?.querySelector("[data-submit]");
    const alertBox = root.querySelector("[data-alert]");

    // --- program pills ---
    function renderPills() {
      pillRoot.innerHTML = "";
      programs.forEach((p) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "option-pill" + (p.id === state.programId ? " active" : "");
        btn.textContent = `${p.label} · $${p.price}`;
        btn.addEventListener("click", () => {
          state.programId = p.id;
          state.selectedTime = null; // times may differ
          // If the prior selected date isn't valid for the new program, clear it
          // so the calendar doesn't show a disabled cell as "selected".
          if (state.selectedDate) {
            const next = programs.find((x) => x.id === p.id);
            if (next && Array.isArray(next.sessions) && next.sessions.length) {
              const ok = next.sessions.some((s) =>
                sameDay(state.selectedDate, new Date(s.start + "T00:00:00"))
              );
              if (!ok) state.selectedDate = null;
            }
          }
          renderPills();
          renderCalendar();
          renderSlots();
          renderSummary();
        });
        pillRoot.appendChild(btn);
      });
    }

    // --- calendar ---
    function renderCalendar() {
      const first = state.viewMonth;
      const monthLabel = first.toLocaleString(undefined, { month: "long", year: "numeric" });

      // Disable prev button for months before current
      const today = startOfMonth(new Date());
      const canPrev = first.getTime() > today.getTime();

      calRoot.innerHTML = `
        <div class="cal-head">
          <div class="month">${monthLabel}</div>
          <div class="cal-nav">
            <button type="button" data-prev aria-label="Previous month" ${canPrev ? "" : "disabled"}>‹</button>
            <button type="button" data-next aria-label="Next month">›</button>
          </div>
        </div>
        <div class="cal-grid" role="grid">
          ${["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map(d => `<div class="cal-dow">${d}</div>`).join("")}
        </div>
      `;

      const grid = calRoot.querySelector(".cal-grid");
      const daysInMonth = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
      const startDay = first.getDay(); // 0..6 Sun..Sat
      const todayDate = new Date(); todayDate.setHours(0,0,0,0);

      // leading blanks
      for (let i = 0; i < startDay; i++) {
        const e = document.createElement("div");
        e.className = "cal-cell empty";
        grid.appendChild(e);
      }

      // Resolve the active program so we can gate session-based calendars.
      const activeProgram = programs.find((p) => p.id === state.programId);
      const gatedToStarts =
        activeProgram && Array.isArray(activeProgram.sessions) && activeProgram.sessions.length;

      for (let d = 1; d <= daysInMonth; d++) {
        const cellDate = new Date(first.getFullYear(), first.getMonth(), d);
        const cell = document.createElement("button");
        cell.type = "button";
        cell.className = "cal-cell";
        cell.textContent = d;

        const isPast = cellDate < todayDate;
        const dow = cellDate.getDay();
        // closed on Sundays for demo
        const closed = dow === 0;

        // Session-based programs: only the first day of each session is clickable.
        let notSessionStart = false;
        if (gatedToStarts) {
          notSessionStart = !activeProgram.sessions.some((s) =>
            sameDay(cellDate, new Date(s.start + "T00:00:00"))
          );
        }

        if (isPast || closed || notSessionStart) {
          cell.classList.add("disabled");
          cell.disabled = true;
        }

        if (sameDay(cellDate, todayDate)) cell.classList.add("today");
        if (state.selectedDate && sameDay(cellDate, state.selectedDate)) cell.classList.add("selected");

        cell.addEventListener("click", () => {
          if (cell.disabled) return;
          state.selectedDate = cellDate;
          state.selectedTime = null;
          renderCalendar();
          renderSlots();
          renderSummary();
        });

        grid.appendChild(cell);
      }

      calRoot.querySelector("[data-prev]").addEventListener("click", () => {
        if (!canPrev) return;
        state.viewMonth = addMonths(first, -1);
        renderCalendar();
      });
      calRoot.querySelector("[data-next]").addEventListener("click", () => {
        state.viewMonth = addMonths(first, 1);
        renderCalendar();
      });
    }

    // --- time slots ---
    function slotsForDay(date, program) {
      if (!date) return [];
      // Per-program start date (e.g. group lessons begin on a fixed kickoff day).
      if (program && program.startDate) {
        const start = new Date(program.startDate + "T00:00:00");
        if (date < start) return [];
      }
      // Per-program sessions — only the first day (start date) of each session
      // is bookable. Picking that date reserves the full 2-week session at the
      // chosen time slot; no other days in the session are separately bookable.
      if (program && Array.isArray(program.sessions) && program.sessions.length) {
        const isSessionStart = program.sessions.some((s) =>
          sameDay(date, new Date(s.start + "T00:00:00"))
        );
        if (!isSessionStart) return [];
      }
      const dow = date.getDay();
      // Per-program hours (e.g. lap swim vs lessons) override the scheduler default.
      const src = (program && program.hours) ? program.hours : hoursByDow;
      const hours = src[dow];
      if (!hours) return [];
      const [start, end] = hours;
      const stepMin = program.durationMin;
      const out = [];
      for (let m = start * 60; m + stepMin <= end * 60; m += stepMin) {
        const h = Math.floor(m / 60);
        const mm = m % 60;
        out.push({
          value: `${pad(h)}:${pad(mm)}`,
          label: formatTime(h, mm),
        });
      }
      return out;
    }

    function renderSlots() {
      const program = programs.find((p) => p.id === state.programId);
      const list = slotsForDay(state.selectedDate, program);

      if (slotLabel) {
        if (state.selectedDate) {
          const d = state.selectedDate.toLocaleDateString(undefined, {
            weekday: "long", month: "long", day: "numeric",
          });
          slotLabel.innerHTML = `Available times <small>${d} · ${program.durationMin} min</small>`;
        } else {
          slotLabel.innerHTML = `Available times <small>Pick a date to see open slots</small>`;
        }
      }

      slotRoot.innerHTML = "";
      if (!state.selectedDate) {
        slotRoot.innerHTML = `<div class="slots-empty">Select a date on the left to view available times.</div>`;
        return;
      }
      if (!list.length) {
        // If the program has a future start date, explain why this day is empty.
        if (program && program.startDate) {
          const start = new Date(program.startDate + "T00:00:00");
          if (state.selectedDate < start) {
            const niceStart = start.toLocaleDateString(undefined, { month: "long", day: "numeric" });
            slotRoot.innerHTML = `<div class="slots-empty">${program.label.split(" · ")[0]} starts ${niceStart}. Pick a date on or after ${niceStart}.</div>`;
            return;
          }
        }
        // Programs with sessions are only bookable on the session's start date.
        if (program && Array.isArray(program.sessions) && program.sessions.length) {
          const fmt = (iso) => new Date(iso + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" });
          const list = program.sessions.map((s, i) => `Session ${i + 1} · ${fmt(s.start)}`).join(" · ");
          slotRoot.innerHTML = `<div class="slots-empty">Pick a session start date to book the full 2-week session. ${list}.</div>`;
          return;
        }
        slotRoot.innerHTML = `<div class="slots-empty">No lessons offered on this day. Please pick another date.</div>`;
        return;
      }

      list.forEach((slot) => {
        // deterministically mark ~30% of slots as already booked, for realism
        const booked = pseudoBooked(state.selectedDate, slot.value);
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "slot" + (state.selectedTime === slot.value ? " selected" : "");
        btn.textContent = slot.label;
        if (booked) {
          btn.disabled = true;
          btn.title = "This slot is already booked";
        }
        btn.addEventListener("click", () => {
          state.selectedTime = slot.value;
          renderSlots();
          renderSummary();
        });
        slotRoot.appendChild(btn);
      });
    }

    // --- summary + form enable state ---
    function renderSummary() {
      if (!summary) return;
      const program = programs.find((p) => p.id === state.programId);
      const dateLabel = state.selectedDate
        ? state.selectedDate.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })
        : "—";
      const timeLabel = state.selectedTime ? formatTime(...state.selectedTime.split(":").map(Number)) : "—";

      // For session-based programs, show the full session window as the date span.
      let dateCell = dateLabel;
      if (state.selectedDate && Array.isArray(program.sessions) && program.sessions.length) {
        const match = program.sessions.find((s) =>
          sameDay(state.selectedDate, new Date(s.start + "T00:00:00"))
        );
        if (match) {
          const fmt = (iso) => new Date(iso + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" });
          dateCell = `${fmt(match.start)} – ${fmt(match.end)} (2-week session)`;
        }
      }

      summary.innerHTML = `
        <dt>Program</dt><dd>${program.label}</dd>
        <dt>Date</dt><dd>${dateCell}</dd>
        <dt>Time</dt><dd>${timeLabel}</dd>
        <dt>Duration</dt><dd>${program.durationMin} min</dd>
        <dt>Price</dt><dd>$${program.price}</dd>
      `;

      const ready = state.selectedDate && state.selectedTime;
      if (submitBtn) {
        submitBtn.disabled = !ready;
        submitBtn.textContent = ready
          ? `Register & pay $${program.price}`
          : "Pick a date & time first";
      }
    }

    // --- alert (scoped to this scheduler) ---
    function showAlert(msg, isError) {
      if (!alertBox) return;
      alertBox.textContent = msg;
      alertBox.classList.remove("error");
      if (isError) alertBox.classList.add("error");
      alertBox.classList.add("show");
    }

    // --- form submit ---
    if (form) {
      form.addEventListener("submit", (e) => {
        e.preventDefault();
        if (!state.selectedDate || !state.selectedTime) return;
        const data = new FormData(form);
        const required = ["parentName", "email", "phone", "swimmerName", "swimmerAge"];
        for (const key of required) {
          if (!data.get(key)) {
            showAlert("Please fill out every required field.", true);
            return;
          }
        }
        const program = programs.find((p) => p.id === state.programId);
        // Placeholder — this is where you would create a Stripe Checkout
        // session (or PayPal order / Square checkout) with the selected
        // program, date, time, and swimmer details.
        const booking = {
          program: program.label,
          price: program.price,
          date: state.selectedDate.toISOString().slice(0, 10),
          time: state.selectedTime,
          parentName: data.get("parentName"),
          email: data.get("email"),
          phone: data.get("phone"),
          swimmerName: data.get("swimmerName"),
          swimmerAge: data.get("swimmerAge"),
          notes: data.get("notes") || "",
        };
        console.log("[New Heights Aquatics] Booking payload:", booking);
        showAlert(
          `Thanks, ${booking.parentName.split(" ")[0]}! ${booking.swimmerName} is tentatively booked for ${program.label} on ${state.selectedDate.toLocaleDateString(undefined,{weekday:"long",month:"long",day:"numeric"})} at ${formatTime(...state.selectedTime.split(":").map(Number))}. Redirecting to secure payment…`,
          false
        );
        // Simulate redirect to checkout.
        setTimeout(() => {
          alert(
            "Payment placeholder:\n\n" +
              `${program.label} · $${program.price}\n` +
              `${booking.swimmerName} · ${booking.date} at ${booking.time}\n\n` +
              "Hook this button up to Stripe Checkout, PayPal, or Square to go live."
          );
        }, 600);
      });
    }

    // --- init ---
    renderPills();
    renderCalendar();
    renderSlots();
    renderSummary();
  }

  // ---------- helpers ----------
  function startOfMonth(d) {
    return new Date(d.getFullYear(), d.getMonth(), 1);
  }
  function addMonths(d, n) {
    return new Date(d.getFullYear(), d.getMonth() + n, 1);
  }
  function sameDay(a, b) {
    return a.getFullYear() === b.getFullYear() &&
      a.getMonth() === b.getMonth() &&
      a.getDate() === b.getDate();
  }
  function pad(n) { return String(n).padStart(2, "0"); }
  function formatTime(h, m) {
    const ampm = h >= 12 ? "PM" : "AM";
    const hour = ((h + 11) % 12) + 1;
    return `${hour}:${pad(m)} ${ampm}`;
  }
  // All slots are currently available — no simulated bookings.
  // (Hook this up to a real availability API later if you want to gray out
  // full time slots.)
  function pseudoBooked(date, time) {
    return false;
  }

  // ---------- Active nav link ----------
  const path = location.pathname.split("/").pop() || "index.html";
  document.querySelectorAll(".nav-links a").forEach((a) => {
    const href = a.getAttribute("href");
    if (href === path) a.classList.add("active");
  });
})();
