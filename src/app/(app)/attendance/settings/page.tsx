import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { isBoss } from "@/lib/rbac";
import { getAttendanceSetting } from "@/lib/attendance";
import { Card, PageHeader, SectionTitle } from "@/components/ui";
import { AttendanceSettingForm } from "@/components/AttendanceSettingForm";

export default async function AttendanceSettingsPage() {
  const user = await getCurrentUser();
  if (!user) return null;
  if (!(isBoss(user.role) || user.role === "HR_ADMIN")) redirect("/attendance");

  const setting = await getAttendanceSetting();

  return (
    <>
      <PageHeader title="Attendance Settings" subtitle="Company policy for working hours, grace period and diamond rules (Asia/Kuala_Lumpur)." />
      <Card>
        <SectionTitle>Policy & Rewards</SectionTitle>
        <AttendanceSettingForm setting={setting as unknown as Record<string, unknown>} />
      </Card>
    </>
  );
}
