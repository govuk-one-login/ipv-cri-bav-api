import { ISessionItem } from "../models/ISessionItem";
import { PersonIdentityName, PersonIdentityBirthDate } from "../models/PersonIdentityItem";

export type TxmaEventName =
	"BAV_CRI_START" | 
	"BAV_COP_REQUEST_SENT" | 
	"BAV_COP_RESPONSE_RECEIVED" | 
	"BAV_EXPERIAN_REQUEST_SENT" |
	"BAV_EXPERIAN_RESPONSE_RECEIVED" |
	"BAV_CRI_VC_ISSUED" |
	"BAV_CRI_END" | 
	"BAV_CRI_SESSION_ABORTED";

export interface TxmaUser {
	user_id: string;
	session_id: string;
	govuk_signin_journey_id: string;
	ip_address?: string | undefined;
}

export interface BaseTxmaEvent {
	user: TxmaUser;
	timestamp: number;
	event_timestamp_ms: number;
	component_id: string;
}

export interface BankAccountDetails {
	sortCode: string;
	accountNumber: string;
}

export interface ExperianRequestDetails {
	name: string;
	sortCode: string;
	accountNumber: string;
	attemptNum: number;
}

export interface CopRequestDetails {
	name: string;
	sortCode: string;
	accountNumber: string;
	attemptNum: number;
}

export interface RestrictedObject {
	name?: PersonIdentityName[];
	birthDate?: PersonIdentityBirthDate[];
	bankAccount?: BankAccountDetails[];
	Experian_request_details?: ExperianRequestDetails[];
	CoP_request_details?: CopRequestDetails[];
	device_information?: {
		encoded: string;
	};
}

export interface CiReasons {
	ci?: string;
	reason?: string;
}

export type VerifiedCredentialEvidenceTxMA = Array<{
	txn: string;
	attemptNum?: number;
	strengthScore?: number;
	validityScore?: number;
	verificationScore?: number;
	ci?: string[];
	ciReasons?: CiReasons[];
}>;

export interface ExtensionObject {
	evidence?: VerifiedCredentialEvidenceTxMA;
}

export interface TxmaEvent extends BaseTxmaEvent {
	event_name: TxmaEventName;
	restricted?: RestrictedObject;
	extensions?: ExtensionObject;
}

export const buildCoreEventFields = (
	session: ISessionItem,
	issuer: string,
	sourceIp?: string | undefined,
): BaseTxmaEvent => {
	const now = Date.now();
	return {
		user: {
			user_id: session.subject,
			session_id: session.sessionId,
			govuk_signin_journey_id: session.clientSessionId,
			ip_address: sourceIp,
		},
		timestamp: Math.floor(now / 1000),
		event_timestamp_ms: now,
		component_id: issuer,
	};
};
