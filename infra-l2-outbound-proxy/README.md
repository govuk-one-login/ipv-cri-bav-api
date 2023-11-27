# infra-l2-outbound-proxy

BAV Outbound Proxy API Gateway definition

## Pipeline status

[![Deploy to Dev](https://github.com/govuk-one-login/di-ipv-cri-bav-api/actions/workflows/post-merge-outbound-proxy-to-dev.yml/badge.svg)](https://github.com/govuk-one-login/di-ipv-cri-bav-api/actions/workflows/post-merge-outbound-proxy-to-dev.yml)
[![Deploy to Build](https://github.com/govuk-one-login/di-ipv-cri-bav-api/actions/workflows/post-merge-outbound-proxy-to-build.yml/badge.svg)](https://github.com/govuk-one-login/di-ipv-cri-bav-api/actions/workflows/post-merge-outbound-proxy-to-build.yml)

## Developing an HTTP API as a proxy for outbound services integrated with BAV

This HTTP proxy integration will enable us to connect an API route to outbound integrated services within BAV - currently defined for HMRC.

1. The client submits a request to the new endpoint, routed to the new API Gateway.

2. The API Gateway forwards the request to the publicly accessible third-party endpoint.

3. The API Gateway forwards the response back to the client.

After deploy, the proxy will be available on a custom URL in non dev, as https://proxy.${env}.account.gov.uk (except dropping the env in prod).

### How to deploy ###

Before you deploy the proxy you will need to login to the GDS's VPN and AWS account:
export AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_SESSION_TOKEN to access AWS account CLI

```
cd infra-l2-outbound-proxy
sam build
sam deploy --stack-name infra-l2-outbound-proxy --parameter-overrides Environment=dev  --confirm-changeset
```
