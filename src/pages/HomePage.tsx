import { CheckCircle2, ClipboardList } from "lucide-react";
import { PageWrapper } from "../components/PageWrapper";
import { ui } from "../app/ui";
import type { PatientProfile } from "../types";

export function HomePage({
  onSubmitProfile,
  profile,
  updateProfile,
}: {
  onSubmitProfile: () => void;
  profile: PatientProfile;
  updateProfile: (next: Partial<PatientProfile>) => void;
}) {
  return (
    <PageWrapper key="profile">
      <section className="grid min-h-[calc(100vh-81px)] w-full place-items-center p-[clamp(28px,4vw,58px)]">
        <div className="marble-card unveil-card w-[min(920px,100%)] p-[clamp(24px,3vw,38px)]">
          <div className={ui.sectionTitle}>
            <ClipboardList size={28} />
            <div>
              <p className={ui.eyebrow}>ข้อมูลผู้รับการทดสอบ · Patient Profile</p>
              <h2 className={ui.title}>
                ข้อมูลพื้นฐานก่อนเริ่มประเมิน
                <span className="en-sub">Basic information before assessment</span>
              </h2>
            </div>
          </div>
          <div className="premium-form mb-6 grid grid-cols-2 gap-[18px] max-[700px]:grid-cols-1">
            <label>
              ชื่อผู้ทดสอบ <span className="en-sub" style={{display:"inline", fontSize:"0.82em"}}>Name</span>
              <input
                onChange={(event) => updateProfile({ name: event.target.value })}
                value={profile.name}
              />
            </label>
            <label>
              รหัสผู้รับการทดสอบ <span className="en-sub" style={{display:"inline", fontSize:"0.82em"}}>Patient ID</span>
              <input
                onChange={(event) => updateProfile({ id: event.target.value })}
                value={profile.id}
              />
            </label>
            <label>
              อายุ <span className="en-sub" style={{display:"inline", fontSize:"0.82em"}}>Age</span>
              <input
                max={110}
                min={45}
                onChange={(event) => updateProfile({ age: Number(event.target.value) })}
                type="number"
                value={profile.age}
              />
            </label>
            <label>
              เพศ <span className="en-sub" style={{display:"inline", fontSize:"0.82em"}}>Sex</span>
              <select
                onChange={(event) =>
                  updateProfile({ sex: event.target.value as PatientProfile["sex"] })
                }
                value={profile.sex}
              >
                <option value="female">หญิง · Female</option>
                <option value="male">ชาย · Male</option>
                <option value="other">อื่น ๆ · Other</option>
                <option value="prefer-not">ไม่ต้องการระบุ · Prefer not to say</option>
              </select>
            </label>
            <label>
              แขนที่ถนัด <span className="en-sub" style={{display:"inline", fontSize:"0.82em"}}>Dominant arm</span>
              <select
                onChange={(event) =>
                  updateProfile({
                    preferredArm: event.target.value as PatientProfile["preferredArm"],
                  })
                }
                value={profile.preferredArm}
              >
                <option value="right">ขวา · Right</option>
                <option value="left">ซ้าย · Left</option>
                <option value="unknown">ไม่แน่ใจ · Unsure</option>
              </select>
            </label>
          </div>
          <div className={ui.row}>
            <button className={ui.primaryButton} onClick={onSubmitProfile} type="button">
              <CheckCircle2 size={21} />
              บันทึกและปรับเทียบกล้อง
            </button>
          </div>
        </div>
      </section>
    </PageWrapper>
  );
}
