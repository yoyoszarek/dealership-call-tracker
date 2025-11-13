📊 Hourly Team Tracker

A lightweight, offline-ready productivity dashboard I built for my current job.
I needed a better way to track my calls, contacts, appointments, schedule, and notes every day—without relying on paper or losing data.
This tool replaces handwritten tracking with a clean UI and automatic localStorage saving.

🚀 Features
📈 Real-Time Hourly Metrics

Track and update your metrics with a single click:

Calls

Contacts

Appointments (Retail + Buying)

Hourly totals

Automatic hour rollover

Close hour manually if needed

Visual stacked bar chart for each hour

📅 Daily Schedule Manager

A full scheduling tool where you can:

Add time-specific appointments

Mark entries as Mobile or Office

Auto-require zip code for Mobile appointments

Edit or delete existing rows

Automatically sort appointments by time

Export your schedule as CSV

📝 Notes + Daily Plan

Add free-form notes for the day

Add your daily schedule/plan

Autosaves every second

Fully local to your browser

📚 History Tracking

Save your entire day into a history log:

Calls, Contacts, Appointments, and Total

Saved notes for that day

Saved schedule for that day

View your most recently saved day

Export your full history as CSV

Backup and restore all data via JSON

📤 Import/Export Tools

Export hourly data to CSV

Export full schedule to CSV

Export complete history to CSV

Full JSON backup (all metrics, notes, schedule, and history)

Restore backups at any time

🎨 Clean, Modern UI

Card-based layout

Color-coded tags (Mobile/Office)

Smooth UI interactions

Mobile-responsive styles

Works fully offline

All styling handled through a lightweight custom CSS theme

🛠️ Tech Stack

HTML, CSS, JavaScript

100% client-side

localStorage for data persistence

No backend required

Works offline

CSV and JSON export using native browser APIs

💡 Why I Built This

My workplace requires tracking metrics every hour, but using paper was:

inconvenient

easy to lose

impossible to analyze

not ideal for long-term accountability

So I built this tool to:

keep everything organized

save all data automatically

eliminate paperwork

give myself a reliable way to track performance

make daily reporting faster

📦 Installation

No setup required.

Just open the index.html file in a browser.

Or host it anywhere (GitHub Pages, Netlify, Vercel).

📁 File Overview

index.html — Main dashboard (metrics, notes, history)

schedule.html — Full scheduling interface

script.js — Hourly tracking, history, notes, CSV/JSON logic

schedule.js — Schedule manager logic (add/edit/delete/export)

style.css — UI theme and component styling

📄 License

This project is for personal/work use but may be adapted or shared as needed.
