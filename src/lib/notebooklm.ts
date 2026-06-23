import type { AssessmentSession } from "../types";

export interface NlmResult {
  solutions: string[];
  watchOut: string[];
  raw: string;
}

const GEMINI_API_KEY = (import.meta.env.VITE_GEMINI_API_KEY as string | undefined) ?? "";
const GEMINI_MODEL   = (import.meta.env.VITE_GEMINI_MODEL   as string | undefined) ?? "gemini-2.0-flash";

const GEMINI_URL = `https://generativelanguage.googleapis.com/v1/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

function parseLines(block: string): string[] {
  return block
    .split("\n")
    .map((l) => l.replace(/^[-–•*\d.]\s*/, "").trim())
    .filter((l) => l.length > 4);
}

function parseAnswer(answer: string): { solutions: string[]; watchOut: string[] } {
  const solMatch  = answer.match(/##SOLUTIONS##([\s\S]*?)(?:##WATCHOUT##|$)/);
  const warnMatch = answer.match(/##WATCHOUT##([\s\S]*?)$/);

  if (solMatch ?? warnMatch) {
    return {
      solutions: parseLines(solMatch?.[1]  ?? ""),
      watchOut:  parseLines(warnMatch?.[1] ?? ""),
    };
  }

  // Fallback: split at midpoint
  const lines = answer
    .split("\n")
    .map((l) => l.replace(/^[-–•*\d.]\s*/, "").trim())
    .filter((l) => l.length > 4);
  const mid = Math.ceil(lines.length / 2);
  return { solutions: lines.slice(0, mid), watchOut: lines.slice(mid) };
}

export function buildQuestion(session: AssessmentSession): string {
  const { patientProfile: p, metrics: m } = session;
  const sexTh = p.sex === "male" ? "ชาย" : p.sex === "female" ? "หญิง" : "ไม่ระบุ";
  const armTh = p.preferredArm === "left" ? "ซ้าย" : p.preferredArm === "right" ? "ขวา" : "ไม่ระบุ";
  const riskTh = m.riskLabel === "Good" ? "ดี" : m.riskLabel === "Moderate" ? "ควรติดตาม" : "ควรฝึกเพิ่มเติม";

  return `ผลการทดสอบการเอื้อมแขนของผู้รับการทดสอบ:
- อายุ ${p.age} ปี เพศ${sexTh} แขนถนัด${armTh}
- โรคประจำตัว: ${p.chronicDiseases || "ไม่มี"}

ผลคะแนนวันนี้:
- คะแนนรวม ${m.overallScore}/100 ระดับ: ${riskTh}
- แขนซ้าย  ความเร็ว ${Math.round(m.left.speed)} ความแม่นยำ ${Math.round(m.left.accuracy)} คุณภาพ ${Math.round(m.left.quality)}
- แขนขวา  ความเร็ว ${Math.round(m.right.speed)} ความแม่นยำ ${Math.round(m.right.accuracy)} คุณภาพ ${Math.round(m.right.quality)}
- ความไม่สมมาตร (LNU): ${Math.round(m.asymmetry)} คะแนน
- การใช้แขนซ้าย ${Math.round(m.leftUsagePercent)}%  แขนขวา ${Math.round(m.rightUsagePercent)}%
- อัตราทำสำเร็จ ${Math.round(m.completionRate)}%  คุณภาพกล้อง ${Math.round(m.trackingQuality)}%

กรุณาวิเคราะห์ผลเป็นภาษาไทยและแบ่งคำตอบออกเป็น 2 ส่วนโดยใช้หัวข้อด้านล่างนี้เป็นตัวแบ่ง:
##SOLUTIONS##
(แนวทางการฝึกและคำแนะนำสำหรับนักกายภาพบำบัด 2-3 ข้อ แต่ละข้อขึ้นต้นด้วย -)
##WATCHOUT##
(สัญญาณและสิ่งที่ต้องเฝ้าระวังในการติดตาม 2-3 ข้อ แต่ละข้อขึ้นต้นด้วย -)`;
}

export async function askNotebookLM(session: AssessmentSession): Promise<NlmResult> {
  if (!GEMINI_API_KEY) {
    throw new Error("กรุณาตั้งค่า VITE_GEMINI_API_KEY ใน .env");
  }

  const prompt = buildQuestion(session);

  let response: Response;
  try {
    response = await fetch(GEMINI_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.5,
          maxOutputTokens: 1024,
        },
      }),
    });
  } catch {
    throw new Error("ไม่สามารถเชื่อมต่อ Gemini API ได้ — ตรวจสอบการเชื่อมต่ออินเทอร์เน็ต");
  }

  if (!response.ok) {
    const text = await response.text().catch(() => response.statusText);
    throw new Error(`Gemini ตอบกลับ ${response.status}: ${text}`);
  }

  const data = (await response.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    error?: { message: string };
  };

  if (data.error) {
    throw new Error(`Gemini error: ${data.error.message}`);
  }

  const answer = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  if (!answer) throw new Error("Gemini ไม่ได้ส่งคำตอบกลับมา");

  return { ...parseAnswer(answer), raw: answer };
}
