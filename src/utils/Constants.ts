export class Constants {

	static readonly JWKS_LOGGER_SVC_NAME = "JwksHandler";

	static readonly X_SESSION_ID = "x-govuk-signin-session-id";

	static readonly SESSION_ID = "session-id";

	static readonly SESSION_LOGGER_SVC_NAME : "SessionHandler";

	static readonly AUTHORIZATION_LOGGER_SVC_NAME : "AuthorizationHandler";

	static readonly ACCESSTOKEN_LOGGER_SVC_NAME = "AccessTokenHandler";
	
	static readonly USERINFO_LOGGER_SVC_NAME : "UserInfoHandler";

	static readonly BAV_METRICS_NAMESPACE = "BAV-CRI";

	static readonly DEBUG = "DEBUG";

	static readonly INFO = "INFO";

	static readonly WARN = "WARN";

	static readonly ERROR = "ERROR";

	static readonly BEARER = "Bearer";

	static readonly CODE = "code";

	static readonly REDIRECT_URL = "redirect_uri";

	static readonly GRANT_TYPE = "grant_type";

	static readonly AUTHORIZATION_CODE = "authorization_code";

	static readonly TOKEN_EXPIRY_SECONDS = 3600;

	static readonly REGEX_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-5][0-9a-f]{3}-[089ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

	static readonly SORT_CODE_REGEX = /^[0-9]{6}$/i;

	static readonly ACCOUNT_NUMBER_REGEX = /^[0-9]{6,8}$/i;

	static readonly W3_BASE_CONTEXT = "https://www.w3.org/2018/credentials/v1";

  static readonly DI_CONTEXT = "https://vocab.account.gov.uk/contexts/identity-v1.jsonld";

  static readonly VERIFIABLE_CREDENTIAL = "VerifiableCredential";

  static readonly IDENTITY_CHECK_CREDENTIAL = "IdentityCheckCredential";

	static readonly IDENTITY_CHECK = "IdentityCheck";

  static readonly URN_UUID_PREFIX = "urn:uuid:";

  static readonly AUTHORIZATION_CODE_INDEX_NAME = "authorizationCode-index";
  
  static readonly HMRC_VERIFY_ENDPOINT_PATH = "verify/personal";

	static readonly HMRC_USER_AGENT = "one-login-bav-cri";
}

export const EnvironmentVariables = {
	SESSION_TABLE: "SESSION_TABLE",
	ENCRYPTION_KEY_IDS: "ENCRYPTION_KEY_IDS",
	CLIENT_CONFIG: "CLIENT_CONFIG",
	AUTH_SESSION_TTL_SECS: "AUTH_SESSION_TTL_SECS",
	ISSUER: "ISSUER",
	TXMA_QUEUE_URL: "TXMA_QUEUE_URL",
	PERSON_IDENTITY_TABLE_NAME: "PERSON_IDENTITY_TABLE_NAME",
	SIGNING_KEY_IDS: "SIGNING_KEY_IDS",
	JWKS_BUCKET_NAME: "JWKS_BUCKET_NAME",
	KMS_KEY_ARN: "KMS_KEY_ARN",
	HMRC_BASE_URL: "HMRC_BASE_URL",
	HMRC_CLIENT_ID: "HMRC_CLIENT_ID",
	HMRC_CLIENT_SECRET: "HMRC_CLIENT_SECRET",
	HMRC_TOKEN_SSM_PATH: "HMRC_TOKEN_SSM_PATH",
};

