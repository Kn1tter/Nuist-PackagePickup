/** 访客会话：不落库，JWT 标记 is_guest，仅可浏览 */

export const GUEST_ID = -1;
export const GUEST_STUDENT_ID = 'guest';

export function isGuestPayload(payload) {
  return !!(payload && (payload.is_guest || payload.id === GUEST_ID));
}

export function guestPublicUser() {
  return {
    id: GUEST_ID,
    student_id: GUEST_STUDENT_ID,
    phone: '',
    email: '',
    nickname: '访客',
    signature: '仅浏览模式',
    credit_score: 0,
    xp: 0,
    level: 1,
    xp_into_level: 0,
    xp_to_next: 40,
    xp_progress: 0,
    is_admin: false,
    is_guest: true,
    created_at: null,
  };
}

export function guestTokenPayload() {
  return {
    id: GUEST_ID,
    student_id: GUEST_STUDENT_ID,
    is_guest: true,
  };
}
