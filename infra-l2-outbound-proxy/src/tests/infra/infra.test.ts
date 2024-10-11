import { Template, Match } from 'aws-cdk-lib/assertions';
import { testHelper } from "../../lib/test-helper";

const helper = new testHelper();

it("Should contain only one Api Gateway V2 resource definition", () => {
  helper.getTemplate().resourceCountIs("AWS::ApiGatewayV2::Api", 1);
})

describe("Outbound Proxy Api Gateway Integration URLs", () => {
  test.each`
    ENVIRONMENT      | HMRCURL                                              | EXPERIANURL                           | PRETTYPROXYURL
    ${"dev"}         | ${"https://api.isc.externaltest.tax.service.gov.uk"} | ${"https://uk-api.experian.com"}  | ${"proxy.review-bav.dev.account.gov.uk"}
    ${"build"}       | ${"https://api.isc.externaltest.tax.service.gov.uk"} | ${"https://uk-api.experian.com"}  | ${"proxy.review-bav.build.account.gov.uk"}
    ${"staging"}     | ${"https://api.isc.externaltest.tax.service.gov.uk"} | ${"https://uk-api.experian.com"}  | ${"proxy.review-bav.staging.account.gov.uk"}
    ${"integration"} | ${"https://api.isc.externaltest.tax.service.gov.uk"} | ${"https://uk-api.experian.com"}  | ${"proxy.review-bav.integration.account.gov.uk"}
    ${"production"}  | ${"https://api.isc.production.tax.service.gov.uk"}   | ${"https://uk-api.experian.com"}  | ${"proxy.review-bav.account.gov.uk"}
  `(
    `HTTP proxy integration with proxied URIs for $ENVIRONMENT have correct values`,
    ({ ENVIRONMENT, HMRCURL, EXPERIANURL, PRETTYPROXYURL }) => {
      const mappings = helper
        .getTemplate()
        .findMappings("EnvironmentVariables");
      expect(mappings.EnvironmentVariables[ENVIRONMENT].HMRCURL).toBe(HMRCURL)
      expect(mappings.EnvironmentVariables[ENVIRONMENT].EXPERIANURL).toBe(EXPERIANURL)
      expect(mappings.EnvironmentVariables[ENVIRONMENT].PRETTYPROXYURL).toBe(PRETTYPROXYURL)
    }
  );
})

it("The Outbound Proxy Api Gateway integration type http proxy", () => {
  expect_proxy(helper.getTemplate());
})

it("The Outbound Proxy Api Gateway route any method under /hmrc - proxy", () => {
  expect_route_hmrc(helper.getTemplate());
})

it("The Outbound Proxy Api Gateway route any method under /experian - proxy", () => {
  expect_route_experian(helper.getTemplate());
})

it("The Outbound Proxy API should contain default stage with this specification", () => {
  expect_default_stage(helper.getTemplate());
})

it("The API Gateway should contain associated access log", () => {
  expect_associated_access_log(helper.getTemplate());
})

const expect_proxy = (template: Template) => {
  template.hasResourceProperties("AWS::ApiGatewayV2::Integration", {
    IntegrationType: "HTTP_PROXY",
    IntegrationMethod: "ANY",
  });
}

const expect_route_hmrc = (template: Template) => {
  template.hasResourceProperties("AWS::ApiGatewayV2::Route", {
    ApiId: { Ref: "OutboundProxyApiGatewayAPI" },
    RouteKey: "ANY /hmrc/{proxy+}",
    Target: Match.objectLike({
      "Fn::Join": [
        "/",
        ["integrations", { Ref: "HMRCProxyApiGatewayIntegration" }],
      ],
    }),
  });
}

const expect_route_experian = (template: Template) => {
  template.hasResourceProperties("AWS::ApiGatewayV2::Route", {
    ApiId: { Ref: "OutboundProxyApiGatewayAPI" },
    RouteKey: "ANY /experian/{proxy+}",
    Target: Match.objectLike({
      "Fn::Join": [
        "/",
        ["integrations", { Ref: "ExperianProxyApiGatewayIntegration" }],
      ],
    }),
  });
}

const expect_default_stage = (template: Template) => {
  template.hasResourceProperties("AWS::ApiGatewayV2::Stage", {
    ApiId: Match.objectLike({ Ref: "OutboundProxyApiGatewayAPI" }),
    StageName: "$default",
    AutoDeploy: true,
    DefaultRouteSettings: {
      DataTraceEnabled: false,
      DetailedMetricsEnabled: true,
      ThrottlingBurstLimit: 400,
      ThrottlingRateLimit: 200,
    },
  });
}

const expect_associated_access_log = (template: Template) => {
  template.hasResourceProperties("AWS::Logs::LogGroup", {
    LogGroupName: Match.objectLike({
      "Fn::Sub":
        "/aws/apigateway/outbound-proxy-${Environment}-${AWS::StackName}-APIGW-Access-Log",
    }),
    RetentionInDays: 7,
  });
}
