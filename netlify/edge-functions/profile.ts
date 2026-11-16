// JSON API for the CV content shown on index.html.
//
//   GET /api/profile            -> the whole profile
//   GET /api/profile/:section   -> one section (e.g. /api/profile/experience)
//
// Keep this data in sync with index.html: it must stay factual and match the CV.
import type { Config, Context } from "@netlify/edge-functions";

const profile = {
  name: "Yunus Seven",
  title: "Senior Quality Engineer",
  location: "Warwick, United Kingdom",
  summary:
    "Production quality engineer with 8 years across serial and prototype manufacturing in automotive and aerospace. Currently at Jaguar Land Rover, previously Lead Engineer for aviation engine parts at TEI, a General Electric joint venture.",
  contact: {
    email: "yunus.seven@darussafaka.net",
    phone: "07493 222 972",
    linkedin: "https://www.linkedin.com/in/yunus-seven/",
    calendly: "https://calendly.com/yunuseven138/30min",
    website: "https://yunusseven.netlify.app/",
  },
  experience: [
    {
      role: "Senior Quality Engineer – Forward Model Quality",
      company: "Jaguar Land Rover",
      start: "2024-11",
      end: null,
      current: true,
      highlights: [
        "Analysing and clustering customer survey data, and leading improvement projects in powertrain with cross-functional teams for non-functional customer complaints (JD Power IQS, VDS, APEAL; NCBS; JLR TGW).",
        "Warranty Cost Reduction Squad (full-time secondment since June 2026): analysing powertrain warranty spend and leading initiatives to reduce it by preventing unnecessary or incorrect part replacements and reducing repair labour hours.",
        "Making sure lower-level repairs are in place, and promoting them through accurately mapped diagnostic tests for the retailer network.",
      ],
    },
    {
      role: "Lead Engineer – Product Quality",
      company: "TEI – TUSAŞ Engine Industries (Customer Engines)",
      start: "2022-08",
      end: "2024-11",
      current: false,
      highlights: [
        "Part quality owner for all phases from RFQ to FAI and ongoing serial production.",
        "Nonconformance management (internal and external, 8D, MRB), Preliminary Review dispositions, corrective actions, FAI reports and SPS packages, change management and Six Sigma improvement projects.",
        "NPI projects and serial production of mature parts; MSA and pFMEA risk analyses.",
        "Regular supplier audits to monitor requirements, increase efficiency and drive continuous improvement.",
        "Fixture and gauge design, and reduced run hours of inspection operations by improving measurement capability.",
        "Worked with sheet metals and a wide range of NADCAP-certified special processes: welding, brazing, heat treatment, coating, EDM/ECM, laser and NDT.",
      ],
    },
    {
      role: "Engineer – Product Quality (Projects)",
      company: "TEI – TUSAŞ Engine Industries (Turkish Indigenous Engine Projects)",
      start: "2020-11",
      end: "2022-08",
      current: false,
      highlights: [
        "Responsible quality engineer for a wide variety of parts, including additive, precision-machined blade integrated disks (blisks) and fabricated sheet metal, across several development-stage engine projects.",
        "Measurement using classical on-plate methods as well as CMM and ATOS optical scanning.",
        "Review and approval of design and manufacturing documentation such as technical drawings and operation sheets.",
        "Inspection planning, nonconformance management, First Article Inspection Reports (FAIR), technical drawing checks, and quality requirements for all raw materials, COTS and buy parts.",
      ],
    },
    {
      role: "Quality Control Engineer",
      company: "Birinci Automotive",
      start: "2019-02",
      end: "2020-10",
      current: false,
      highlights: [
        "Customer relations and complaints management: RCCA, 8D reports, and regular customer site visits in Turkey and Europe.",
        "Incoming and ongoing production quality: internal corrective and preventive actions, internal audits, MSA, SPC, pFMEA, supplier relations and Asaichi.",
        "Analysis and reduction of quality-related costs.",
      ],
    },
    {
      role: "Intern – Manufacturing Engineering",
      company: "Borusan Mannesmann",
      start: "2016-10",
      end: "2017-07",
      current: false,
      highlights: [
        "10-month production engineering internship at a cold-drawn steel pipe factory serving the automotive industry.",
      ],
    },
  ],
  skills: {
    "Standards & systems": ["AS9100", "AS9102", "IATF 16949", "VDA 6.3", "EASA Part 21G", "QMS", "DPRV", "Internal Auditor"],
    "Quality planning": ["APQP", "PPAP", "FAI / FAIR", "SPS", "FMEA / pFMEA", "Control Plan", "Inspection Planning", "Design Review", "NPI"],
    "Problem solving & improvement": ["8D", "RCCA", "CAPA", "5 Why", "Ishikawa", "Pareto", "DMAIC", "Lean Six Sigma Green Belt", "Kaizen", "5S", "Gemba", "Asaichi"],
    "Measurement & inspection": ["MSA", "Gauge R&R", "SPC", "GD&T", "CMM", "ATOS optical scanning", "Welding Inspection", "NADCAP special processes"],
    "Customer & field quality": ["JD Power IQS", "VDS", "APEAL", "NCBS", "TGW", "Warranty analysis", "Spend reduction", "Supplier quality"],
    "Software & programming": ["Python", "C++", "MATLAB", "SolidWorks", "AutoCAD", "Fusion 360", "Arduino", "MS Office"],
  },
  education: [
    {
      qualification: "Mechanical Engineering",
      institution: "Istanbul Technical University, Turkey",
      period: "Graduated 2018",
      notes: "Taught in English.",
    },
    {
      qualification: "Mechanical Engineering (Exchange)",
      institution: "Piraeus University of Applied Sciences, Athens, Greece",
      period: "2014 – 2015",
      notes: "Erasmus+ European Exchange Programme.",
    },
    {
      qualification: "Middle & High School",
      institution: "Darüşşafaka Schools",
      period: "2002 – 2012",
      notes:
        "Free private boarding school with entry by examination and English-language high school education. Scholarship continued throughout university.",
    },
  ],
  languages: [
    { language: "Turkish", level: "Native" },
    { language: "English", level: "Fluent" },
    { language: "German", level: "Basic" },
    { language: "French", level: "Basic" },
  ],
};

type Section = keyof typeof profile;
const sections = Object.keys(profile) as Section[];

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      // netlify.toml [[headers]] don't apply to edge function responses, so set them here.
      "x-content-type-options": "nosniff",
      // Browsers always revalidate; Netlify's CDN keeps it until the next deploy.
      "cache-control": "public, max-age=0, must-revalidate",
      "netlify-cdn-cache-control": "public, s-maxage=31536000, must-revalidate",
    },
  });

export default async (_request: Request, context: Context) => {
  const section = context.params.section;

  if (!section) return json(profile);

  if (!sections.includes(section as Section)) {
    return json({ error: `Unknown section "${section}"`, sections }, 404);
  }

  return json(profile[section as Section]);
};

export const config: Config = {
  path: ["/api/profile", "/api/profile/:section"],
  method: ["GET", "HEAD"],
  cache: "manual",
};
