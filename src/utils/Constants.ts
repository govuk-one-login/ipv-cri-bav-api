export class Constants {

	static readonly JWKS_LOGGER_SVC_NAME = "JwksHandler";

	static readonly X_SESSION_ID = "x-govuk-signin-session-id";

	static readonly X_FORWARDED_FOR = "x-forwarded-for";

	static readonly ENCODED_AUDIT_HEADER = "txma-audit-encoded";

	static readonly SESSION_ID = "session-id";

	static readonly SESSION_LOGGER_SVC_NAME : "SessionHandler";

	static readonly AUTHORIZATION_LOGGER_SVC_NAME : "AuthorizationHandler";

	static readonly HMRC_TOKEN_LOGGER_SVC_NAME : "HmrcTokenHandler";

	static readonly EXPERIAN_TOKEN_LOGGER_SVC_NAME : "ExperianTokenHandler";

	static readonly ACCESSTOKEN_LOGGER_SVC_NAME = "AccessTokenHandler";
	
	static readonly USERINFO_LOGGER_SVC_NAME : "UserInfoHandler";

	static readonly ABORT_LOGGER_SVC_NAME : "AbortHandler";

	static readonly PERSON_INFO_KEY_LOGGER_SVC_NAME : "PersonInfoKeyHandler";
	
	static readonly PARTIAL_NAME_MATCH_HANDLER : "PartialNameMatchHandler";

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

  static readonly HMRC_TOKEN_ENDPOINT_PATH = "/oauth/token";

  static readonly HMRC_EXPECTED_TOKEN_EXPIRES_IN = 14400;
  
  static readonly HMRC_VERIFY_ENDPOINT_PATH = "verify/personal";
  
  static readonly HMRC_USER_AGENT = "one-login-bav-cri";
  
  static readonly EXPERIAN_TOKEN_ENDPOINT_PATH = "/oauth2/experianone/v1/token";

  static readonly EXPERIAN_VERIFY_ENDPOINT_PATH = "services/v0/applications/3";

  static readonly EXPERIAN_EXPECTED_TOKEN_EXPIRES_IN = 14400;

  static readonly EXPERIAN_USER_AGENT = "one-login-bav-cri";
  
  static readonly MAX_VERIFY_ATTEMPTS = 2;

  static readonly TXMA_FIELDS_TO_SHOW = ["event_name", "session_id", "govuk_signin_journey_id", "attemptNum"];

  static readonly EXPERIAN_PRODUCT_NAME = "BAVConsumer-Standard";
}

export const EnvironmentVariables = {
	SESSION_TABLE: "SESSION_TABLE",
	ENCRYPTION_KEY_IDS: "ENCRYPTION_KEY_IDS",
	CLIENT_CONFIG: "CLIENT_CONFIG",
	AUTH_SESSION_TTL_SECS: "AUTH_SESSION_TTL_SECS",
	ISSUER: "ISSUER",
	TXMA_QUEUE_URL: "TXMA_QUEUE_URL",
	PARTIAL_MATCHES_QEUEUE_URL: "PARTIAL_MATCHES_QEUEUE_URL",
	PERSON_IDENTITY_TABLE_NAME: "PERSON_IDENTITY_TABLE_NAME",
	SIGNING_KEY_IDS: "SIGNING_KEY_IDS",
	DNSSUFFIX: "DNSSUFFIX",
	JWKS_BUCKET_NAME: "JWKS_BUCKET_NAME",
	PARTIAL_MATCHES_BUCKET: "PARTIAL_MATCHES_BUCKET",
	PARTIAL_MATCHES_BUCKET_KEY: "PARTIAL_MATCHES_BUCKET_KEY",
	KMS_KEY_ARN: "KMS_KEY_ARN",
	HMRC_BASE_URL: "HMRC_BASE_URL",
	HMRC_CLIENT_ID_SSM_PATH: "HMRC_CLIENT_ID_SSM_PATH",
	HMRC_CLIENT_SECRET_SSM_PATH: "HMRC_CLIENT_SECRET_SSM_PATH",
	HMRC_CLIENT_ID: "HMRC_CLIENT_ID",
	HMRC_CLIENT_SECRET: "HMRC_CLIENT_SECRET",
	HMRC_TOKEN_SSM_PATH: "HMRC_TOKEN_SSM_PATH",
	HMRC_MAX_RETRIES: "HMRC_MAX_RETRIES",
	HMRC_TOKEN_BACKOFF_PERIOD_MS: "HMRC_TOKEN_BACKOFF_PERIOD_MS",
	EXPERIAN_BASE_URL: "EXPERIAN_BASE_URL",
	EXPERIAN_MAX_RETRIES: "EXPERIAN_MAX_RETRIES",
	EXPERIAN_TOKEN_TABLE: "EXPERIAN_TOKEN_TABLE",
	EXPERIAN_PASSWORD_SSM_PATH: "EXPERIAN_PASSWORD_SSM_PATH",
	EXPERIAN_USERNAME_SSM_PATH: "EXPERIAN_USERNAME_SSM_PATH",
	EXPERIAN_CLIENT_ID_SSM_PATH: "EXPERIAN_CLIENT_ID_SSM_PATH",
	EXPERIAN_CLIENT_SECRET_SSM_PATH: "EXPERIAN_CLIENT_SECRET_SSM_PATH",
	PRIVATE_KEY_SSM_PATH: "PRIVATE_KEY_SSM_PATH",
	PUBLIC_KEY_SSM_PATH: "PUBLIC_KEY_SSM_PATH",
	CREDENTIAL_VENDOR_SSM_PATH: "CREDENTIAL_VENDOR_SSM_PATH",
};

