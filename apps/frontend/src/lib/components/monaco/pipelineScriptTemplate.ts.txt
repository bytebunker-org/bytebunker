interface Output {
	someOutputData: string;
}

async function executeModule({ logger, inputData }: PipelineModuleExecutionContext): Promise<Output> {
	logger.log('Hello World!');

	return {
		someOutputData: 'test'
	};
}
