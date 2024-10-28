import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import {
  aws_ec2
} from 'aws-cdk-lib';
import { Role, ServicePrincipal, PolicyStatement, Effect, CompositePrincipal, Policy } from 'aws-cdk-lib/aws-iam';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as ssm from 'aws-cdk-lib/aws-ssm';

export class EcsJobStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const Vpc = aws_ec2.Vpc.fromLookup(this, 'ecs-job', {
      vpcId: 'vpc-',
      isDefault: false,
    });

    const taskRole = new Role(this, 'ecs-job-task-role', {
      assumedBy: new ServicePrincipal('ecs-tasks.amazonaws.com')
    });

    const ExecutionRole = new Role(this, 'ecsTaskExecutionRole', {
      assumedBy: new ServicePrincipal('ecs-tasks.amazonaws.com')
    });

    ExecutionRole.addToPolicy(new PolicyStatement({
      actions: [
        'ssm:DescribeParameters',
        'ssm:GetParameter',
        'ssm:GetParameterHistory',
        'ssm:GetParameters',
      ],
      resources: ['*'],
      effect: Effect.ALLOW
    }));

    // ECS Task Definition
    const taskDefinition = new ecs.FargateTaskDefinition(this, 'ecs-job-task', {
      cpu: 2048,
      memoryLimitMiB: 4096,
      runtimePlatform: {
        'cpuArchitecture': ecs.CpuArchitecture.X86_64,
        'operatingSystemFamily': ecs.OperatingSystemFamily.LINUX
      },
      taskRole: taskRole,
      executionRole: ExecutionRole
    });

    // ECR Repository
    const ecrRepository = new ecr.Repository(this, 'ecs-job-image', {
      repositoryName: 'ecs-job'
    });

    // ECS Container
    const container = taskDefinition.addContainer('ecs-jobcontainer', {
      image: ecs.ContainerImage.fromEcrRepository(ecrRepository),
      logging: new ecs.AwsLogDriver({
        streamPrefix: 'ecs-jobcontainer'
      }),
      pseudoTerminal: false,
    });

    container.addEnvironment(
      'SERVICE_ID', ssm.StringParameter.valueFromLookup(this, 'PD_SERVICE_ID')
    );
    container.addSecret(
      "INCIDENT_COUNT",
      ecs.Secret.fromSsmParameter(
        ssm.StringParameter.fromSecureStringParameterAttributes(this, 'INCIDENT_COUNT', {
          parameterName: 'INCIDENT_COUNT',
          version: 1
        })
      )
    );
    container.addSecret(
      "INCIDENT_INTERVAL",
      ecs.Secret.fromSsmParameter(
        ssm.StringParameter.fromSecureStringParameterAttributes(this, 'INCIDENT_INTERVAL', {
          parameterName: 'INCIDENT_INTERVAL',
          version: 1
        })
      )
    );
    container.addEnvironment(
      'SCENARIO_NAME',ssm.StringParameter.valueFromLookup(this, 'SCENARIO_NAME')
    );

    container.addSecret(
      "PAGERDUTY_API_KEY",
      ecs.Secret.fromSsmParameter(
        ssm.StringParameter.fromSecureStringParameterAttributes(this, 'PAGERDUTY_API_KEY', {
          parameterName: 'PAGERDUTY_API_KEY',
          version: 1
        })
      )
    );

    // ECS　Cluster
    new ecs.Cluster(this, 'ecs-jobcluster', {
      vpc: Vpc,
      clusterName: 'ecs-jobcluster',
      enableFargateCapacityProviders: true
    });

    new aws_ec2.SecurityGroup(this, 'ecs-job-sg', {
      vpc: Vpc,
      securityGroupName: 'ecs-job-sg',
      allowAllOutbound: true
    });
  }
}
