/*
 * Shared data store for PERFORMATRACK.
 * Single source of truth so every page reads the SAME real data the teacher
 * enters in the Class Record and Attendance pages (no fabricated numbers).
 *
 * Exposes a global `PT` object.
 */
(function () {
  const STUDENTS_KEY = "ptStudents";
  const RECORD_KEY = "ptClassRecord";
  const CATEGORIES_KEY = "ptClassCategories";
  const ATTENDANCE_KEY = "ptAttendanceRecords";
  const WEIGHT_SETTINGS_KEY = "__settings";
  const DEFAULT_ATTENDANCE_WEIGHT = 5;

  const SUBJECTS = [
    "Filipino",
    "English",
    "Math",
    "Science",
    "Araling Panlipunan",
    "MAPEH",
    "EPP",
    "ESP",
  ];

  const QUARTERS = ["Q1", "Q2", "Q3", "Q4"];

  const DEFAULT_CATEGORIES = [
    { id: "activities", name: "Activities", weight: 40 },
    { id: "performance", name: "Performance Tasks", weight: 40 },
    { id: "exam", name: "Exam", weight: 20 },
  ];

  const STATUS_POINTS = {
    Present: 1,
    Late: 0.75,
    Excused: 0.8,
    Absent: 0,
  };

  // Grade thresholds for the early-support labels.
  const LABEL_THRESHOLDS = { excellent: 90, onTrack: 80, needsAttention: 75 };
  const MIN_RISK_MODEL_SAMPLES = 30;
  const MIN_RISK_MODEL_CLASS_SAMPLES = 5;
  const MIN_RISK_MODEL_STUDENTS = 10;
  const RISK_MODEL_VERSION = 1;

  function safeRead(key, fallback) {
    const raw = localStorage.getItem(key);
    if (!raw) {
      return fallback;
    }
    try {
      const parsed = JSON.parse(raw);
      return parsed ?? fallback;
    } catch (error) {
      return fallback;
    }
  }

  function safeReadSession(key, fallback) {
    const raw = sessionStorage.getItem(key);
    if (!raw) {
      return fallback;
    }
    try {
      return JSON.parse(raw) ?? fallback;
    } catch (error) {
      return fallback;
    }
  }

  function round1(value) {
    return Math.round(value * 10) / 10;
  }

  function getStudents() {
    const raw = safeRead(STUDENTS_KEY, null);
    if (!Array.isArray(raw)) {
      return [];
    }

    return raw
      .map((student) => {
        const id = String(student.id || "").trim();
        return {
          id,
          name: String(student.name || "").trim(),
          firstName: String(student.firstName || "").trim(),
          surname: String(student.surname || "").trim(),
          middleInitial: String(student.middleInitial || "").trim(),
          gradeLevel: String(student.gradeLevel || "—").trim(),
          section: String(student.section || "—").trim(),
          subjects: Array.isArray(student.subjects)
            ? [...new Set(student.subjects.map((subject) => String(subject).trim()).filter(Boolean))]
            : null,
        };
      })
      .filter((student) => student.id && student.name);
  }

  function getStudentSubjects(studentId) {
    const student = getStudent(studentId);
    return student && student.subjects && student.subjects.length
      ? student.subjects
      : SUBJECTS.slice();
  }

  function getStudent(studentId) {
    return getStudents().find((student) => student.id === studentId) || null;
  }

  function getAttendanceWeight() {
    const settings = safeRead(CATEGORIES_KEY, {});
    const stored = Number(settings && settings[WEIGHT_SETTINGS_KEY]?.attendanceWeight);
    return Number.isFinite(stored)
      ? Math.min(Math.max(round1(stored), 0), 10)
      : DEFAULT_ATTENDANCE_WEIGHT;
  }

  function scaleCategoryWeights(categories, targetTotal) {
    const currentTotal = categories.reduce((sum, category) => sum + category.weight, 0);
    if (currentTotal <= 0 || !categories.length) {
      return categories;
    }
    let assigned = 0;
    return categories.map((category, index) => {
      const weight =
        index === categories.length - 1
          ? round1(targetTotal - assigned)
          : round1((category.weight / currentTotal) * targetTotal);
      assigned = round1(assigned + weight);
      return { ...category, weight };
    });
  }

  function getCategories(subject) {
    const stored = safeRead(CATEGORIES_KEY, {});
    const list = stored && typeof stored === "object" ? stored[subject] : null;
    const categories = Array.isArray(list) && list.length
      ? list.map((category) => ({
          id: String(category.id),
          name: String(category.name ?? "Category"),
          weight: Number.isFinite(Number(category.weight)) ? Number(category.weight) : 0,
        }))
      : scaleCategoryWeights(
          DEFAULT_CATEGORIES.map((category) => ({ ...category })),
          100 - getAttendanceWeight()
        );
    const settings = stored && typeof stored === "object" ? stored[WEIGHT_SETTINGS_KEY] : null;
    if (Number(settings?.weightModelVersion) >= 1) {
      return categories;
    }
    return scaleCategoryWeights(categories, 100 - getAttendanceWeight());
  }

  function categoriesValid(subject) {
    const categories = getCategories(subject);
    const total = round1(categories.reduce((sum, category) => sum + category.weight, 0));
    return categories.length > 0 &&
      Math.abs(total + getAttendanceWeight() - 100) < 0.001;
  }

  function componentPercent(items) {
    let sumScore = 0;
    let sumTotal = 0;
    let hasValid = false;

    (items || []).forEach((item) => {
      const score = Number(item && item.score);
      const total = Number(item && item.total);
      if (Number.isFinite(score) && Number.isFinite(total) && total > 0 && score >= 0) {
        sumScore += score;
        sumTotal += total;
        hasValid = true;
      }
    });

    if (!hasValid || sumTotal <= 0) {
      return null;
    }
    return (sumScore / sumTotal) * 100;
  }

  // Quarter grade for one subject, computed exactly like the Class Record page.
  function getQuarterGrade(studentId, subject, quarter) {
    const record = safeRead(RECORD_KEY, null);
    const entry = record && record[studentId] && record[studentId][subject]
      ? record[studentId][subject][quarter]
      : null;
    if (!entry || typeof entry !== "object") {
      return null;
    }
    if (!categoriesValid(subject)) {
      return null;
    }

    const categories = getCategories(subject);
    let weightedTotal = 0;
    let complete = true;

    categories.forEach((category) => {
      const percent = componentPercent(entry[category.id]);
      if (percent === null) {
        complete = false;
      } else {
        weightedTotal += (percent * category.weight) / 100;
      }
    });

    const academicWeight = categories.reduce((sum, category) => sum + category.weight, 0);
    return complete && academicWeight > 0
      ? Math.round((weightedTotal / academicWeight) * 100)
      : null;
  }

  // Returns { subject: [q1, q2, q3, q4] } with numbers or null per quarter.
  function getSubjectGrades(studentId) {
    const result = {};
    getStudentSubjects(studentId).forEach((subject) => {
      result[subject] = QUARTERS.map((quarter) => getQuarterGrade(studentId, subject, quarter));
    });
    return result;
  }

  function average(values) {
    const present = values.filter((value) => value !== null && value !== undefined);
    if (!present.length) {
      return null;
    }
    return present.reduce((sum, value) => sum + value, 0) / present.length;
  }

  function getSubjectAverage(studentId, subject) {
    const grades = QUARTERS.map((quarter) => getQuarterGrade(studentId, subject, quarter));
    return average(grades);
  }

  function getQuarterAverages(studentId) {
    const grades = getSubjectGrades(studentId);
    return QUARTERS.map((_, index) => {
      const values = getStudentSubjects(studentId).map((subject) => grades[subject][index]);
      return average(values);
    });
  }

  function getGeneralAverage(studentId) {
    const subjectAverages = getStudentSubjects(studentId).map((subject) =>
      getSubjectAverage(studentId, subject)
    );
    const academicAverage = average(subjectAverages);
    if (academicAverage === null) {
      return null;
    }
    const attendanceRate = getAttendanceRate(studentId);
    if (attendanceRate === null) {
      return academicAverage;
    }
    const attendanceWeight = getAttendanceWeight();
    return round1(
      (academicAverage * (100 - attendanceWeight) + attendanceRate * attendanceWeight) / 100
    );
  }

  function getAttendanceRate(studentId) {
    const records = safeRead(ATTENDANCE_KEY, []);
    if (!Array.isArray(records)) {
      return null;
    }
    const own = records.filter((record) => record && record.studentId === studentId);
    if (!own.length) {
      return null;
    }
    const earned = own.reduce((sum, record) => {
      const points = STATUS_POINTS[record.status];
      return sum + (Number.isFinite(points) ? points : 0);
    }, 0);
    return Math.round((earned / own.length) * 100);
  }

  // Label derived from real grades; attendance can pull a borderline student down.
  function getLabel(generalAverage, attendanceRate) {
    if (generalAverage === null || generalAverage === undefined) {
      return "No Data";
    }
    let label;
    if (generalAverage >= LABEL_THRESHOLDS.excellent) {
      label = "Excellent";
    } else if (generalAverage >= LABEL_THRESHOLDS.onTrack) {
      label = "On Track";
    } else if (generalAverage >= LABEL_THRESHOLDS.needsAttention) {
      label = "Needs Attention";
    } else {
      label = "At Risk";
    }

    if (label === "On Track" && Number.isFinite(attendanceRate) && attendanceRate < 85) {
      label = "Needs Attention";
    }
    return label;
  }

  function labelBadge(label) {
    if (label === "Excellent") {
      return '<span class="badge badge-excellent">Excellent</span>';
    }
    if (label === "On Track") {
      return '<span class="badge badge-on-track">On Track</span>';
    }
    if (label === "Needs Attention") {
      return '<span class="badge badge-needs-attention">Needs Attention</span>';
    }
    if (label === "At Risk") {
      return '<span class="badge badge-at-risk">At Risk</span>';
    }
    return '<span class="badge bg-secondary">No Data</span>';
  }

  function getStudentSummary(studentId) {
    const generalAverage = getGeneralAverage(studentId);
    const attendanceRate = getAttendanceRate(studentId);
    return {
      generalAverage,
      attendanceRate,
      label: getLabel(generalAverage, attendanceRate),
    };
  }

  function getRiskTrainingSamples() {
    const samples = [];
    getStudents().forEach((student) => {
      getStudentSubjects(student.id).forEach((subject) => {
        const grades = QUARTERS.map((quarter) =>
          getQuarterGrade(student.id, subject, quarter)
        );
        for (let targetIndex = 1; targetIndex < grades.length; targetIndex += 1) {
          const previousGrade = grades[targetIndex - 1];
          const targetGrade = grades[targetIndex];
          if (previousGrade === null || targetGrade === null) {
            continue;
          }
          const hasTrend = grades[targetIndex - 2] !== null &&
            grades[targetIndex - 2] !== undefined;
          samples.push({
            studentId: student.id,
            features: [
              previousGrade / 100,
              hasTrend ? (previousGrade - grades[targetIndex - 2]) / 100 : 0,
              hasTrend ? 1 : 0,
            ],
            label: targetGrade < LABEL_THRESHOLDS.needsAttention ? 1 : 0,
          });
        }
      });
    });
    return samples;
  }

  function sigmoid(value) {
    const bounded = Math.max(-35, Math.min(35, value));
    return 1 / (1 + Math.exp(-bounded));
  }

  function trainRiskLogisticRegression(samples) {
    const featureCount = samples[0].features.length;
    const means = Array.from({ length: featureCount }, (_, index) =>
      samples.reduce((sum, sample) => sum + sample.features[index], 0) / samples.length
    );
    const scales = means.map((mean, index) => {
      const variance = samples.reduce(
        (sum, sample) => sum + (sample.features[index] - mean) ** 2,
        0
      ) / samples.length;
      const standardDeviation = Math.sqrt(variance);
      return standardDeviation > 0 ? standardDeviation : 1;
    });
    const weights = Array(featureCount).fill(0);
    let bias = 0;
    const learningRate = 0.15;
    const regularization = 0.01;

    for (let iteration = 0; iteration < 1200; iteration += 1) {
      const weightGradients = Array(featureCount).fill(0);
      let biasGradient = 0;
      samples.forEach((sample) => {
        const normalized = sample.features.map(
          (value, index) => (value - means[index]) / scales[index]
        );
        const probability = sigmoid(
          bias + normalized.reduce((sum, value, index) => sum + value * weights[index], 0)
        );
        const error = probability - sample.label;
        biasGradient += error;
        normalized.forEach((value, index) => {
          weightGradients[index] += error * value;
        });
      });

      bias -= learningRate * biasGradient / samples.length;
      weights.forEach((weight, index) => {
        weights[index] -= learningRate *
          (weightGradients[index] / samples.length + regularization * weight);
      });
    }

    return { means, scales, weights, bias };
  }

  function isValidRiskModel(model) {
    return Boolean(
      model &&
      model.version === RISK_MODEL_VERSION &&
      Array.isArray(model.means) &&
      Array.isArray(model.scales) &&
      Array.isArray(model.weights) &&
      model.means.length === 3 &&
      model.scales.length === 3 &&
      model.weights.length === 3 &&
      [...model.means, ...model.scales, ...model.weights, model.bias]
        .every(Number.isFinite) &&
      model.scales.every((scale) => scale > 0) &&
      model.gradeThreshold === LABEL_THRESHOLDS.needsAttention &&
      Number(model.trainingExamples) >= MIN_RISK_MODEL_SAMPLES &&
      Number(model.trainingStudents) >= MIN_RISK_MODEL_STUDENTS &&
      Number(model.belowThresholdExamples) >= MIN_RISK_MODEL_CLASS_SAMPLES &&
      Number(model.trainingExamples) - Number(model.belowThresholdExamples) >=
        MIN_RISK_MODEL_CLASS_SAMPLES
    );
  }

  function trainPerformanceRiskModel() {
    const samples = getRiskTrainingSamples();
    const belowThresholdExamples = samples.filter((sample) => sample.label === 1).length;
    const otherExamples = samples.length - belowThresholdExamples;
    const trainingStudents = new Set(samples.map((sample) => sample.studentId)).size;
    if (
      samples.length < MIN_RISK_MODEL_SAMPLES ||
      trainingStudents < MIN_RISK_MODEL_STUDENTS ||
      belowThresholdExamples < MIN_RISK_MODEL_CLASS_SAMPLES ||
      otherExamples < MIN_RISK_MODEL_CLASS_SAMPLES
    ) {
      return {
        available: false,
        trainingExamples: samples.length,
      };
    }

    return {
      available: true,
      model: {
        ...trainRiskLogisticRegression(samples),
        version: RISK_MODEL_VERSION,
        trainingExamples: samples.length,
        trainingStudents,
        belowThresholdExamples,
        gradeThreshold: LABEL_THRESHOLDS.needsAttention,
      },
    };
  }

  function predictRisk(model, features) {
    const normalized = features.map(
      (value, index) => (value - model.means[index]) / model.scales[index]
    );
    return sigmoid(
      model.bias + normalized.reduce((sum, value, index) => sum + value * model.weights[index], 0)
    );
  }

  function getRiskDemoPreview() {
    const subjects = ["Filipino", "English", "Math"];
    const students = Array.from({ length: 20 }, (_, index) => {
      const student = {
        id: `DEMO-STU-${String(index + 1).padStart(2, "0")}`,
        name: `Sample Student ${String(index + 1).padStart(2, "0")}`,
        subjects: {},
        attendance: [0, 1, 2].map((quarterIndex) => {
          const groupBase = index < 10 ? 84 : 90;
          const quarterAdjustment = quarterIndex === 1 ? -2 : quarterIndex === 2 ? -4 : 0;
          return Math.max(
            65,
            Math.min(100, groupBase + ((index * 7 + quarterIndex * 3) % 11) - 5 + quarterAdjustment)
          );
        }),
      };
      subjects.forEach((subject, subjectIndex) => {
        const subjectOffset = subjectIndex - 1;
        const baseGrade = (index < 10 ? 70 : 74) + (index % 6) * 2 + subjectOffset;
        student.subjects[subject] = index < 10
          ? [baseGrade + 4, baseGrade + 1, baseGrade]
          : [baseGrade - 4, baseGrade - 1, baseGrade];
      });
      return student;
    });
    const samples = [];

    students.forEach((student) => {
      Object.values(student.subjects).forEach((grades) => {
        for (let targetIndex = 1; targetIndex < grades.length; targetIndex += 1) {
          const previousGrade = grades[targetIndex - 1];
          const hasTrend = targetIndex > 1;
          samples.push({
            studentId: student.id,
            features: [
              previousGrade / 100,
              hasTrend ? (previousGrade - grades[targetIndex - 2]) / 100 : 0,
              student.attendance[targetIndex - 1] / 100,
              hasTrend ? 1 : 0,
            ],
            label: grades[targetIndex] < LABEL_THRESHOLDS.needsAttention ? 1 : 0,
          });
        }
      });
    });

    const model = trainRiskLogisticRegression(samples);
    const featureNames = ["Previous grade", "Grade trend", "Attendance", "Trend available"];
    return {
      trainingExamples: samples.length,
      trainingStudents: students.length,
      featureNames,
      model: {
        means: model.means,
        scales: model.scales,
        weights: model.weights,
        bias: model.bias,
      },
      students: students.map((student) => {
        const forecasts = {};
        for (let targetIndex = 1; targetIndex < QUARTERS.length; targetIndex += 1) {
          const previousIndex = targetIndex - 1;
          const subjectPredictions = Object.entries(student.subjects).map(([subject, grades]) => {
            const previousGrade = grades[previousIndex];
            const hasTrend = previousIndex > 0;
            const featureValues = [
              previousGrade / 100,
              hasTrend ? (previousGrade - grades[previousIndex - 1]) / 100 : 0,
              student.attendance[previousIndex] / 100,
              hasTrend ? 1 : 0,
            ];
            const contributions = featureValues.map(
              (value, featureIndex) =>
                ((value - model.means[featureIndex]) / model.scales[featureIndex]) *
                model.weights[featureIndex]
            );
            return {
              subject,
              previousGrade,
              gradeTrend: hasTrend ? previousGrade - grades[previousIndex - 1] : null,
              attendanceRate: student.attendance[previousIndex],
              contributions,
              probability: sigmoid(model.bias + contributions.reduce((sum, value) => sum + value, 0)),
            };
          });
          forecasts[QUARTERS[targetIndex]] = {
            previousQuarter: QUARTERS[previousIndex],
            previousQuarterAverage: average(subjectPredictions.map((item) => item.previousGrade)),
            averageGradeTrend: average(
              subjectPredictions
                .map((item) => item.gradeTrend)
                .filter((trend) => trend !== null)
            ),
            attendanceRate: student.attendance[previousIndex],
            probability: average(subjectPredictions.map((item) => item.probability)),
            averageContributions: featureNames.map((name, featureIndex) => ({
              name,
              value: average(
                subjectPredictions.map((item) => item.contributions[featureIndex])
              ),
            })),
            subjects: subjectPredictions,
          };
        }
        return {
          id: student.id,
          name: student.name,
          gradesBySubject: student.subjects,
          attendanceByQuarter: student.attendance,
          forecasts,
        };
      }),
    };
  }

  function getNextQuarterRiskPrediction(studentId) {
    const students = getStudents();
    const student = students.find((item) => item.id === studentId);
    if (!student) {
      return { available: false, reason: "Student data is unavailable." };
    }

    const localModel = trainPerformanceRiskModel();
    let model = localModel.available ? localModel.model : null;
    let modelSource = "this class";
    if (!model) {
      const savedModel = safeReadSession("ptPerformanceRiskModel", null);
      if (isValidRiskModel(savedModel)) {
        model = savedModel;
        modelSource = "teacher's class";
      }
    }
    if (!model) {
      return {
        available: false,
        reason: `The model needs at least ${MIN_RISK_MODEL_SAMPLES} completed quarter-to-quarter examples from ${MIN_RISK_MODEL_STUDENTS} students, including ${MIN_RISK_MODEL_CLASS_SAMPLES} outcomes below ${LABEL_THRESHOLDS.needsAttention} and ${MIN_RISK_MODEL_CLASS_SAMPLES} outcomes at or above ${LABEL_THRESHOLDS.needsAttention}. Current examples: ${localModel.trainingExamples}.`,
      };
    }

    const gradesBySubject = Object.fromEntries(
      getStudentSubjects(studentId).map((subject) => [
        subject,
        QUARTERS.map((quarter) => getQuarterGrade(studentId, subject, quarter)),
      ])
    );
    let latestQuarterIndex = -1;
    Object.values(gradesBySubject).forEach((grades) => {
      grades.forEach((grade, index) => {
        if (grade !== null) {
          latestQuarterIndex = Math.max(latestQuarterIndex, index);
        }
      });
    });
    if (latestQuarterIndex < 0) {
      return { available: false, reason: "There are no completed quarter grades to use." };
    }
    if (latestQuarterIndex >= QUARTERS.length - 1) {
      return { available: false, reason: "There is no later quarter available to forecast." };
    }

    const subjectProbabilities = Object.values(gradesBySubject)
      .filter((grades) => grades[latestQuarterIndex] !== null)
      .map((grades) => {
        const hasTrend = latestQuarterIndex > 0 && grades[latestQuarterIndex - 1] !== null;
        return predictRisk(model, [
          grades[latestQuarterIndex] / 100,
          hasTrend
            ? (grades[latestQuarterIndex] - grades[latestQuarterIndex - 1]) / 100
            : 0,
          hasTrend ? 1 : 0,
        ]);
      });
    if (!subjectProbabilities.length) {
      return { available: false, reason: "There are no completed grades in the latest quarter." };
    }

    return {
      available: true,
      probability: subjectProbabilities.reduce((sum, value) => sum + value, 0) /
        subjectProbabilities.length,
      trainingExamples: model.trainingExamples,
      trainingStudents: model.trainingStudents,
      modelSource,
      forecastSubjects: subjectProbabilities.length,
      nextQuarter: QUARTERS[latestQuarterIndex + 1],
    };
  }

  window.PT = {
    SUBJECTS: SUBJECTS.slice(),
    QUARTERS: QUARTERS.slice(),
    LABEL_THRESHOLDS,
    round1,
    average,
    getStudents,
    getStudent,
    getStudentSubjects,
    getCategories,
    getQuarterGrade,
    getSubjectGrades,
    getSubjectAverage,
    getQuarterAverages,
    getGeneralAverage,
    getAttendanceRate,
    getAttendanceWeight,
    getLabel,
    labelBadge,
    getStudentSummary,
    trainPerformanceRiskModel,
    getRiskDemoPreview,
    getNextQuarterRiskPrediction,
  };
})();
