import { VerifiedCredentialSubject } from "../models/IVeriCredential";
import { ISessionItem } from "../models/ISessionItem";
import { absoluteTimeNow } from "./DateTimeUtils";

export type TxmaEventName =
	"BAV_CRI_START" | 
	"BAV_CRI_AUTH_CODE_ISSUED";

export interface TxmaUser {
	"user_id": string;
	"persistent_session_id": string;
	"session_id": string;
	"govuk_signin_journey_id"?: string;
	"ip_address"?: string | undefined;
}

export interface BaseTxmaEvent {
	"user": TxmaUser;
	"client_id": string;
	"timestamp": number;
	"component_id": string;
}

export interface RestrictedObject {
	"user"?: VerifiedCredentialSubject;
	"name"?: object[];
}

export type VerifiedCredentialEvidenceTxMA = Array<{
	type?: string;
	txn: string;
	strengthScore?: number;
	validityScore?: number;
	verificationScore?: number;
	ci?: string[];
}>;

export interface ExtensionObject {
	"evidence"?: VerifiedCredentialEvidenceTxMA;
	"previous_govuk_signin_journey_id"?: string;
}

export interface TxmaEvent extends BaseTxmaEvent {
	"event_name": TxmaEventName;
	"restricted"?: RestrictedObject;
	"extensions"?: ExtensionObject;
}

export const buildCoreEventFields = (
	session: ISessionItem,
	issuer: string,
	sourceIp?: string | undefined,
	getNow: () => number = absoluteTimeNow,
): BaseTxmaEvent => {
	return {
		user: {
			user_id: session.subject,
			persistent_session_id: session.persistentSessionId,
			session_id: session.sessionId,
			ip_address: sourceIp,
		},
		client_id: session.clientId,
		timestamp: getNow(),
		component_id: issuer,
	};
};
