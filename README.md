# di-ipv-cri-bav-api
Backend for the identify proving and verification bank account verification CRI which allow users with no photo ID use their bank account as evidence of their identity. 

More information about the scope and technical design can be found on [confluence](https://govukverify.atlassian.net/wiki/spaces/BAC/overview)

## Local development

For local development deploy a custom stack:
1. `cd /deploy`
2. In samconfig.toml change `stack_name` to a custom stack name of your choice
3. Log in using AWS SSO
4. Deploy by running `sam build && sam deploy --config-env dev --resolve-s3`

Note: When deploying custom stacks in dev NotLocalTestStack will prevent the scheduling of cron for HmrcTokenFunction unless the stackname is bav-cri-api
If you require a BE stack with those capabilities please use the "Deploy Main to Dev Env" Github Workflow with your branch to deploy your changes to the main Dev Stack

