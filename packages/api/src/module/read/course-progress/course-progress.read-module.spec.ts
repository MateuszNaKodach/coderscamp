import { CourseProgress } from '@prisma/client';
import { AsyncReturnType } from 'type-fest';
import { v4 as uuid } from 'uuid';
import waitForExpect from 'wait-for-expect';

import { initTestModule } from '@/common/test-utils';
import { ApplicationEvent } from '@/module/application-command-events';
import { LearningMaterialsUrlWasGenerated } from '@/module/events/learning-materials-url-was-generated.domain-event';
import { TaskWasCompleted } from '@/module/events/task-was-completed.domain-event';
import { TaskWasUncompleted } from '@/module/events/task-was-uncompleted-event.domain-event';
import { EventStreamName } from '@/write/shared/application/event-stream-name.value-object';

const statusTask = (
  learningMaterialsId: string,
  type: 'TaskWasUncompleted' | 'TaskWasCompleted',
): ApplicationEvent<TaskWasUncompleted | TaskWasCompleted> => {
  return {
    type,
    id: uuid(),
    occurredAt: new Date(),
    data: {
      learningMaterialsId,
      taskId: '2',
    },
    metadata: { correlationId: 'generatedId1', causationId: 'generatedId1' },
    streamVersion: 1,
    streamName: EventStreamName.from('LearningMaterialsTasks', learningMaterialsId),
  };
};

const givenData = (id: string) => {
  return {
    id,
    courseUserId: `userId-${id}`,
    learningMaterialsId: `learningMaterialsId-${id}`,
    initialLearningMaterialCompletedTask: 0,
  };
};

async function courseProgressTestModule() {
  const { prismaService, close, eventOccurred } = await initTestModule();

  async function expectReadModel(expectation: {
    learningMaterialsId: string;
    readModel: Omit<CourseProgress, 'id'> | null;
  }) {
    await waitForExpect(() =>
      expect(
        prismaService.courseProgress.findUnique({
          where: { learningMaterialsId: expectation.learningMaterialsId },
          select: {
            id: false,
            courseUserId: true,
            learningMaterialsCompletedTasks: true,
            learningMaterialsId: true,
          },
        }),
      ).resolves.toStrictEqual(expectation.readModel),
    );
  }

  return { eventOccurred, expectReadModel, close };
}

const learningMaterialsUrlWasGeneratedWithId = (id: string): ApplicationEvent<LearningMaterialsUrlWasGenerated> => {
  const SAMPLE_MATERIALS_URL = 'https://app.process.st/runs/jNMTGn96H8Xe3H8DbcpJOg';
  const courseUserId = `userId-${id}`;

  return {
    type: 'LearningMaterialsUrlWasGenerated',
    id: uuid(),
    occurredAt: new Date(),
    data: {
      learningMaterialsId: `learningMaterialsId-${id}`,
      courseUserId,
      materialsUrl: SAMPLE_MATERIALS_URL,
    },
    metadata: { correlationId: 'generatedId1', causationId: 'generatedId1' },
    streamVersion: 1,
    streamName: EventStreamName.from('LearningMaterialsUrl', courseUserId),
  };
};

describe('Read Slice | CourseProgress', () => {
  let moduleUnderTest: AsyncReturnType<typeof courseProgressTestModule>;

  beforeEach(async () => {
    moduleUnderTest = await courseProgressTestModule();
  });

  afterEach(async () => {
    await moduleUnderTest.close();
  });

  it('when taskWasCompleted occurred, then learningMaterialsCompletedTasks should be increased', async () => {
    // Given
    const { id, courseUserId, learningMaterialsId, initialLearningMaterialCompletedTask } = givenData(uuid());

    moduleUnderTest.eventOccurred(learningMaterialsUrlWasGeneratedWithId(id));

    await moduleUnderTest.expectReadModel({
      learningMaterialsId,
      readModel: {
        learningMaterialsId,
        courseUserId,
        learningMaterialsCompletedTasks: initialLearningMaterialCompletedTask,
      },
    });

    // When
    moduleUnderTest.eventOccurred(statusTask(learningMaterialsId, 'TaskWasCompleted'));

    // Then
    const learningMaterialCompletedTaskAfterEvent = initialLearningMaterialCompletedTask + 1;

    await moduleUnderTest.expectReadModel({
      learningMaterialsId,
      readModel: {
        learningMaterialsId,
        courseUserId,
        learningMaterialsCompletedTasks: learningMaterialCompletedTaskAfterEvent,
      },
    });
  });

  it('when taskWasUnCompleted then learningMaterialsCompletedTasks should be decrease', async () => {
    // Given
    const { id, courseUserId, learningMaterialsId, initialLearningMaterialCompletedTask } = givenData(uuid());

    moduleUnderTest.eventOccurred(learningMaterialsUrlWasGeneratedWithId(id));

    await moduleUnderTest.expectReadModel({
      learningMaterialsId,
      readModel: {
        learningMaterialsId,
        courseUserId,
        learningMaterialsCompletedTasks: initialLearningMaterialCompletedTask,
      },
    });

    // When
    moduleUnderTest.eventOccurred(statusTask(learningMaterialsId, 'TaskWasCompleted'));

    // Then
    const learningMaterialCompletedTaskAfterEvent = initialLearningMaterialCompletedTask + 1;

    await moduleUnderTest.expectReadModel({
      learningMaterialsId,
      readModel: {
        learningMaterialsId,
        courseUserId,
        learningMaterialsCompletedTasks: learningMaterialCompletedTaskAfterEvent,
      },
    });

    // When
    moduleUnderTest.eventOccurred(statusTask(learningMaterialsId, 'TaskWasUncompleted'));

    // Then
    await moduleUnderTest.expectReadModel({
      learningMaterialsId,
      readModel: {
        learningMaterialsId,
        courseUserId,
        learningMaterialsCompletedTasks: 0,
      },
    });
  });

  it('when taskWasUnCompleted and learningMaterialsCompletedTasks is equal to 0 then  learningMaterialsCompletedTasks should be 0', async () => {
    // Given
    const { id, courseUserId, learningMaterialsId, initialLearningMaterialCompletedTask } = givenData(uuid());

    // When
    moduleUnderTest.eventOccurred(learningMaterialsUrlWasGeneratedWithId(id));

    // Then
    await moduleUnderTest.expectReadModel({
      learningMaterialsId,
      readModel: {
        learningMaterialsId,
        courseUserId,
        learningMaterialsCompletedTasks: initialLearningMaterialCompletedTask,
      },
    });

    // When
    moduleUnderTest.eventOccurred(statusTask(learningMaterialsId, 'TaskWasUncompleted'));
    // Then
    await moduleUnderTest.expectReadModel({
      learningMaterialsId,
      readModel: {
        learningMaterialsId,
        courseUserId,
        learningMaterialsCompletedTasks: 0,
      },
    });
  });
});
