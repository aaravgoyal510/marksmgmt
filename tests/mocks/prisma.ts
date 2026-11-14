function createFallbackFn(impl?: any) {
  const fn: any = function (...args: any[]) {
    fn.mock.calls.push(args);
    if (fn._mockResolvedValue !== undefined) {
      return Promise.resolve(fn._mockResolvedValue);
    }
    if (fn._mockReturnValue !== undefined) {
      return fn._mockReturnValue;
    }
    if (typeof impl === "function") return impl(...args);
    return undefined;
  };
  fn.mock = { calls: [] };
  fn.mockResolvedValue = (val: any) => {
    fn._mockResolvedValue = val;
    return fn;
  };
  fn.mockReturnValue = (val: any) => {
    fn._mockReturnValue = val;
    return fn;
  };
  fn.mockImplementation = (fnImpl: any) => {
    impl = fnImpl;
    return fn;
  };
  fn.mockReset = () => {
    fn.mock.calls = [];
    fn._mockResolvedValue = undefined;
    fn._mockReturnValue = undefined;
    return fn;
  };
  fn.mockClear = () => {
    fn.mock.calls = [];
    return fn;
  };
  return fn;
}

function resolveFn(viInstance?: any): Function {
  if (viInstance?.fn) {
    return viInstance.fn.bind(viInstance);
  }
  if (typeof (globalThis as any).vi?.fn === "function") {
    return (globalThis as any).vi.fn.bind((globalThis as any).vi);
  }
  return createFallbackFn;
}

function createModelMock(fn: Function) {
  return {
    findUnique: fn(),
    findFirst: fn(),
    findMany: fn().mockResolvedValue([]),
    create: fn(),
    createMany: fn().mockResolvedValue({ count: 0 }),
    update: fn(),
    updateMany: fn().mockResolvedValue({ count: 0 }),
    upsert: fn(),
    delete: fn(),
    deleteMany: fn().mockResolvedValue({ count: 0 }),
    count: fn().mockResolvedValue(0),
    aggregate: fn(),
    groupBy: fn(),
  };
}

export type PrismaModelMock = ReturnType<typeof createModelMock>;

export interface PrismaMock {
  user: PrismaModelMock;
  studentProfile: PrismaModelMock;
  facultyProfile: PrismaModelMock;
  department: PrismaModelMock;
  batch: PrismaModelMock;
  section: PrismaModelMock;
  academicTerm: PrismaModelMock;
  subject: PrismaModelMock;
  subjectOffering: PrismaModelMock;
  subjectOfferingSection: PrismaModelMock;
  gradingPolicy: PrismaModelMock;
  scoreComponent: PrismaModelMock;
  attendanceSlabRange: PrismaModelMock;
  attendanceRecord: PrismaModelMock;
  mark: PrismaModelMock;
  query: PrismaModelMock;
  queryMessage: PrismaModelMock;
  notification: PrismaModelMock;
  auditLog: PrismaModelMock;
  hODAssignment: PrismaModelMock;
  $transaction: any;
  $queryRaw: any;
  $executeRaw: any;
  $connect: any;
  $disconnect: any;
  [key: string]: any;
}

const MODEL_NAMES = [
  "user",
  "studentProfile",
  "facultyProfile",
  "department",
  "batch",
  "section",
  "academicTerm",
  "subject",
  "subjectOffering",
  "subjectOfferingSection",
  "gradingPolicy",
  "scoreComponent",
  "attendanceSlabRange",
  "attendanceRecord",
  "mark",
  "query",
  "queryMessage",
  "notification",
  "auditLog",
  "hODAssignment",
] as const;

export function createPrismaMock(viInstance?: any): PrismaMock {
  const fn = resolveFn(viInstance);
  const mock: any = {};

  for (const model of MODEL_NAMES) {
    mock[model] = createModelMock(fn);
  }

  mock.auditLog.create.mockResolvedValue({ id: "audit-1" });

  mock.$transaction = fn(async (cb: any) =>
    typeof cb === "function" ? cb(mock) : Array.isArray(cb) ? Promise.all(cb) : cb
  );
  mock.$queryRaw = fn();
  mock.$executeRaw = fn();
  mock.$connect = fn().mockResolvedValue(undefined);
  mock.$disconnect = fn().mockResolvedValue(undefined);

  return mock as PrismaMock;
}
