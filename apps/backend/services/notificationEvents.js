// apps/backend/services/notificationEvents.js
import {
  rateLimitPush,
  sendPushToMany,
  sendPushToProfiles,
  sendPushToUser,
  shouldSuppressChatPush,
} from './pushService.js';

// Manual test checklist (quick):
// 1) Send a prebooking inquiry → tutor gets a push (Messages deep link).
// 2) Book a session → tutor gets a push (Account.sessions deep link).
// 3) Tutor accepts/declines → student gets a push (Account.sessions deep link).
// 4) Mark complete_pending → student gets a push (Account.sessions deep link).
// 5) Student confirms completion → tutor gets a push (Account.sessions deep link).
// 6) Create/share org assignment → learners in class get a push.
// 7) Send org newsletter → learners get a push.
// 8) Publish exam results → learners get a push.
// 9) Plan upgraded → org purchaser gets a push.
// 10) Tokens purchased → user gets a push.
// 11) Record fee payment → learner gets a push.
// 12) Mark attendance absent → learner gets a push.
// 13) Send chat messages rapidly → pushes throttle (1/min per conversation).

const arrayify = (v) => (Array.isArray(v) ? v : v ? [v] : []);

const buildMessagePayload = (eventType, payload) => {
  switch (eventType) {
    case 'INQUIRY_SENT': {
      const studentName = payload.studentName || 'A student';
      const topic = payload.topic ? `Topic: ${payload.topic}` : 'New inquiry';
      return {
        title: `New inquiry from ${studentName}`,
        body: topic,
        data: {
          screen: 'Messages',
          params: payload.studentProfileId
            ? { studentId: String(payload.studentProfileId) }
            : undefined,
          conversationId: payload.conversationId ? String(payload.conversationId) : undefined,
        },
      };
    }
    case 'SESSION_CREATED': {
      const studentName = payload.studentName || 'a student';
      const subject = payload.subject ? `Subject: ${payload.subject}` : 'New session request';
      return {
        title: 'New session request',
        body: `${studentName} requested a session. ${subject}`,
        data: {
          screen: 'Account',
          params: { tab: 'sessions' },
        },
      };
    }
    case 'SESSION_ACCEPTED': {
      const tutorName = payload.tutorName || 'Your tutor';
      const subject = payload.subject ? `Subject: ${payload.subject}` : 'Session accepted';
      return {
        title: 'Session accepted',
        body: `${tutorName} accepted your session request. ${subject}`,
        data: {
          screen: 'Account',
          params: { tab: 'sessions' },
        },
      };
    }
    case 'SESSION_DECLINED': {
      const tutorName = payload.tutorName || 'Your tutor';
      return {
        title: 'Session declined',
        body: `${tutorName} declined your session request.`,
        data: {
          screen: 'Account',
          params: { tab: 'sessions' },
        },
      };
    }
    case 'SESSION_COMPLETE_PENDING':
      return {
        title: 'Confirm session completion',
        body: 'Your tutor marked a session complete. Please confirm within 24 hours.',
        data: {
          screen: 'Account',
          params: { tab: 'sessions' },
        },
      };
    case 'SESSION_STUDENT_CONFIRMED': {
      const studentName = payload.studentName || 'Your student';
      return {
        title: 'Session confirmed',
        body: `${studentName} confirmed the session completion.`,
        data: {
          screen: 'Account',
          params: { tab: 'sessions' },
        },
      };
    }
    case 'ORG_ASSIGNMENT_POSTED':
    case 'ORG_ASSIGNMENT_SHARED': {
      const title = payload.title || 'New assignment available';
      return {
        title: 'New assignment posted',
        body: title,
        data: {
          screen: 'OrgLearnerHome',
          params: {
            assignmentId: payload.assignmentId ? String(payload.assignmentId) : undefined,
            courseId: payload.courseId ? String(payload.courseId) : undefined,
          },
        },
        collapseKey: payload.orgId && payload.assignmentId
          ? `assignment:${payload.orgId}:${payload.assignmentId}`
          : undefined,
      };
    }
    case 'ORG_NEWSLETTER_SENT': {
      const subject = payload.subject || 'New newsletter available';
      return {
        title: 'New newsletter',
        body: subject,
        data: {
          screen: 'OrgLearnerNewsletters',
          params: { tab: 'newsletters' },
        },
        collapseKey: payload.orgId && payload.newsletterId
          ? `newsletter:${payload.orgId}:${payload.newsletterId}`
          : undefined,
      };
    }
    case 'ORG_EXAM_RESULTS_AVAILABLE': {
      const examTitle = payload.examTitle || 'Exam results';
      return {
        title: 'Exam results available',
        body: `Your results for ${examTitle} are ready.`,
        data: {
          screen: 'OrgExamResultsPortal',
          params: {
            view: 'learner',
            studentId: payload.studentUserId ? String(payload.studentUserId) : undefined,
          },
        },
        collapseKey: payload.orgId && payload.sessionId
          ? `exam:${payload.orgId}:${payload.sessionId}`
          : undefined,
      };
    }
    case 'ORG_FEE_UPDATED': {
      const amount =
        payload.amountCents != null && payload.currency
          ? `${(Number(payload.amountCents) / 100).toFixed(2)} ${payload.currency}`
          : 'a payment';
      return {
        title: 'Fee payment received',
        body: `We recorded ${amount}.`,
        data: {
          screen: 'OrgLearnerFees',
          params: {},
        },
      };
    }
    case 'ORG_FEE_BALANCE_UPDATED': {
      const amount =
        payload.amountCents != null && payload.currency
          ? `${(Number(payload.amountCents) / 100).toFixed(2)} ${payload.currency}`
          : 'an update';
      const deltaLabel =
        payload.deltaType === 'charge'
          ? `New charge: ${amount}.`
          : payload.deltaType === 'payment'
            ? `Payment recorded: ${amount}.`
            : `Balance updated: ${amount}.`;
      return {
        title: 'Fee balance updated',
        body: deltaLabel,
        data: {
          screen: 'OrgLearnerFees',
          params: {},
        },
        collapseKey: payload.orgId && payload.learnerId
          ? `fee:${payload.orgId}:${payload.learnerId}`
          : undefined,
      };
    }
    case 'ORG_ATTENDANCE_ABSENT':
      return {
        title: 'Marked absent',
        body: payload.sessionLabel
          ? `You were marked absent for ${payload.sessionLabel}.`
          : 'You were marked absent for a lesson.',
        data: {
          screen: 'OrgLearnerHome',
          params: {},
        },
      };
    case 'CHAT_MESSAGE': {
      const senderName = payload.senderName || 'New message';
      return {
        title: senderName,
        body: payload.preview || 'You have a new message.',
        data: {
          screen: 'Messages',
          params: payload.senderProfileId
            ? { studentId: String(payload.senderProfileId) }
            : undefined,
          conversationId: payload.conversationId ? String(payload.conversationId) : undefined,
        },
      };
    }
    case 'ORG_PLAN_UPGRADED': {
      const planName = payload.planName || 'your new plan';
      return {
        title: 'Plan upgraded',
        body: `Your organization is now on ${planName}.`,
        data: {
          screen: 'OrgHome',
          params: {},
        },
      };
    }
    case 'TOKENS_PURCHASED': {
      const credits = payload.credits ? Number(payload.credits) : null;
      const body = credits
        ? `Your purchase was successful. ${credits} tokens are now available.`
        : 'Your purchase was successful.';
      return {
        title: 'Tokens added',
        body,
        data: {
          screen: 'Account',
          params: {},
        },
      };
    }
    default:
      return null;
  }
};

export async function notifyEvent(eventType, recipients, payload = {}, meta = {}) {
  if (!eventType) return { ok: false, reason: 'missing_event_type' };

  if (eventType === 'CHAT_MESSAGE') {
    const recipientProfileId =
      meta.recipientProfileId || payload.recipientProfileId || recipients;
    const conversationId = payload.conversationId;
    if (!recipientProfileId || !conversationId) {
      return { ok: false, reason: 'missing_recipient_or_conversation' };
    }

    if (shouldSuppressChatPush(recipientProfileId, conversationId)) {
      return { ok: true, suppressed: true };
    }

    const rateKey = `chat:${conversationId}:recipient:${recipientProfileId}`;
    const { shouldSend, pendingCount } = await rateLimitPush(rateKey, 60);
    if (!shouldSend) return { ok: true, suppressed: true };

    const base = buildMessagePayload('CHAT_MESSAGE', payload);
    if (!base) return { ok: false, reason: 'missing_payload' };
    const count = Math.max(1, pendingCount || 1);
    const finalPayload =
      count > 1
        ? {
            title: 'New messages',
            body: `${count} new messages from ${payload.senderName || 'someone'}`,
            data: base.data,
          }
        : base;

    await sendPushToProfiles([String(recipientProfileId)], finalPayload);
    return { ok: true };
  }

  const message = buildMessagePayload(eventType, payload);
  if (!message) return { ok: false, reason: 'unknown_event' };

  if (meta.profileIds || meta.recipientProfileId) {
    const profileIds = arrayify(meta.profileIds || meta.recipientProfileId);
    if (!profileIds.length) return { ok: false, reason: 'missing_recipients' };
    await sendPushToProfiles(profileIds.map(String), message);
    return { ok: true };
  }

  const userIds = arrayify(recipients).map(String).filter(Boolean);
  if (!userIds.length) return { ok: false, reason: 'missing_recipients' };
  if (userIds.length === 1) {
    await sendPushToUser(userIds[0], message);
  } else {
    await sendPushToMany(userIds, message);
  }
  return { ok: true };
}
