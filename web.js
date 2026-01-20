const express = require("express");
const fs = require("fs");
const path = require("path");
const config = require("./config");
const { spawn } = require("child_process");

const app = express();
const PORT = config.PORT;

const dataCache = {};

function loadAnalysisData(stuno) {
  if (dataCache[stuno]) {
    return dataCache[stuno];
  }

  const fileName = `analysis_${stuno}.json`;
  const filePath = path.join(__dirname, "analysis", fileName);

  if (!fs.existsSync(filePath)) {
    return null;
  }

  const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
  dataCache[stuno] = data;
  return data;
}

app.use(express.static(__dirname));

app.get("/api/collect/:stuno", (req, res) => {
  const { stuno } = req.params;

  if (dataCache[stuno]) {
    return res.json({
      success: true,
      cached: true,
      count: dataCache[stuno].length,
    });
  }

  const indexProcess = spawn("node", ["index.js", stuno]);

  let indexError = "";

  indexProcess.stdout.on("data", (data) => {
    console.log(`[index.js] ${data.toString()}`);
  });

  indexProcess.stderr.on("data", (data) => {
    const errorMsg = data.toString();
    console.error(`[index.js ERROR] ${errorMsg}`);
    indexError += errorMsg;
  });

  indexProcess.on("close", (code) => {
    if (code !== 0) {
      return res
        .status(500)
        .json({ error: `index.js 실행 실패: ${indexError}` });
    }

    const analyzeProcess = spawn("node", ["analyze.js", stuno]);

    let analyzeError = "";

    analyzeProcess.stdout.on("data", (data) => {
      console.log(`[analyze.js] ${data.toString()}`);
    });

    analyzeProcess.stderr.on("data", (data) => {
      const errorMsg = data.toString();
      console.error(`[analyze.js ERROR] ${errorMsg}`);
      analyzeError += errorMsg;
    });

    analyzeProcess.on("close", (code) => {
      if (code !== 0) {
        return res
          .status(500)
          .json({ error: `analyze.js 실행 실패: ${analyzeError}` });
      }

      delete dataCache[stuno];
      const data = loadAnalysisData(stuno);

      if (!data) {
        return res
          .status(500)
          .json({ error: "분석 데이터를 로드할 수 없습니다" });
      }

      res.json({ success: true, cached: false, count: data.length });
    });
  });
});

app.get("/api/courses", (req, res) => {
  const stuno = req.query.stuno;

  if (!stuno) {
    return res.status(400).json({ error: "학번을 입력해주세요" });
  }

  const analysisData = loadAnalysisData(stuno);

  if (!analysisData) {
    return res.status(404).json({ error: "학생 데이터를 로드할 수 없습니다" });
  }

  const courses = analysisData.map((course, index) => ({
    id: index,
    courseName: course.KOR_SBJT_NM,
    instructor: course.STF_NM,
    division: course.CPTN_DIV_NM,
    yy: course.YY,
    shtmCd: course.SHTM_CD,
    myScore: course.myData.totalScore,
    myRank: course.rank,
    totalStudents: course.totalStudents,
  }));

  res.json(courses);
});

app.get("/api/grades/:stuno", (req, res) => {
  const { stuno } = req.params;

  const gradesFileName = `grades_${stuno}.json`;
  const gradesFilePath = path.join(__dirname, "grades", gradesFileName);

  if (!fs.existsSync(gradesFilePath)) {
    return res.status(404).json({ error: "석차 데이터를 찾을 수 없습니다" });
  }

  try {
    const gradesData = JSON.parse(fs.readFileSync(gradesFilePath, "utf-8"));
    const semesters = gradesData.map((sem) => ({
      YY: sem.YY,
      SHTM_CD: sem.SHTM_CD,
      SUST_RANK: sem.SUST_RANK,
    }));
    res.json(semesters);
  } catch (error) {
    res.status(500).json({ error: "석차 데이터 읽기 실패" });
  }
});

app.get("/api/courses/:id", (req, res) => {
  const { id } = req.params;
  const stuno = req.query.stuno;

  if (!stuno) {
    return res.status(400).json({ error: "학번을 입력해주세요" });
  }

  const analysisData = loadAnalysisData(stuno);

  if (!analysisData) {
    return res.status(404).json({ error: "학생 데이터를 로드할 수 없습니다" });
  }

  const courseIndex = parseInt(id, 10);

  if (
    isNaN(courseIndex) ||
    courseIndex < 0 ||
    courseIndex >= analysisData.length
  ) {
    return res.status(404).json({ error: "과목을 찾을 수 없습니다" });
  }

  res.json(analysisData[courseIndex]);
});

app.get("/", (req, res) => {
  const html = `
<!DOCTYPE html>
<html lang="ko">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>성적 상세 조회</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            padding: 20px;
        }

        .container {
            max-width: 1200px;
            margin: 0 auto;
        }

        h1 {
            color: white;
            text-align: center;
            margin-bottom: 30px;
            font-size: 2.5em;
            text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.3);
        }

        .content {
            display: grid;
            grid-template-columns: 1fr 2fr;
            gap: 20px;
            margin-bottom: 20px;
        }

        .courses-list {
            background: white;
            border-radius: 10px;
            padding: 20px;
            box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2);
            max-height: 600px;
            overflow-y: scroll;
            scrollbar-width: none;
        }

        .courses-list::-webkit-scrollbar {
            display: none;
        }

        .courses-list h2 {
            margin-bottom: 15px;
            color: #333;
            font-size: 1.3em;
            border-bottom: 2px solid #667eea;
            padding-bottom: 10px;
        }

        .course-item {
            padding: 12px;
            margin-bottom: 8px;
            background: #f5f5f5;
            border-left: 4px solid #667eea;
            cursor: pointer;
            border-radius: 4px;
            transition: all 0.3s ease;
        }

        .course-item:hover {
            background: #667eea;
            color: white;
            transform: translateX(5px);
        }

        .course-item.active {
            background: #667eea;
            color: white;
        }

        .course-name {
            font-weight: 600;
            margin-bottom: 4px;
        }

        .course-meta {
            font-size: 0.9em;
            opacity: 0.7;
        }

        .detail-panel {
            background: white;
            border-radius: 16px;
            padding: 40px;
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.15);
        }

        .detail-panel.empty {
            display: flex;
            align-items: center;
            justify-content: center;
            color: #999;
            font-size: 1.1em;
            min-height: 400px;
        }

        .detail-header {
            border-left: 4px solid #667eea;
            padding-left: 20px;
            padding-bottom: 25px;
            margin-bottom: 30px;
        }

        .detail-header h2 {
            color: #333;
            font-size: 2em;
            margin-bottom: 12px;
            font-weight: 700;
            letter-spacing: -0.5px;
        }

        .semester-info {
            color: #999;
            font-size: 0.95em;
            font-weight: 500;
        }

        .stats-grid {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 15px;
            margin-bottom: 30px;
        }

        .stat-card {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 28px 20px;
            border-radius: 14px;
            text-align: center;
            box-shadow: 0 8px 25px rgba(102, 126, 234, 0.2);
            transition: transform 0.3s ease, box-shadow 0.3s ease;
        }

        .stat-card:hover {
            transform: translateY(-4px);
            box-shadow: 0 12px 35px rgba(102, 126, 234, 0.3);
        }

        .stat-value {
            font-size: 2.5em;
            font-weight: bold;
            margin-bottom: 5px;
        }

        .stat-label {
            font-size: 0.9em;
            opacity: 0.9;
        }

        .scores-section {
            background: linear-gradient(135deg, #f8f9ff 0%, #f5f7ff 100%);
            padding: 28px;
            border-radius: 14px;
            margin-bottom: 25px;
            border: 1px solid #e8ecff;
            box-shadow: 0 4px 15px rgba(0, 0, 0, 0.03);
        }

        .scores-section h3 {
            color: #333;
            margin-bottom: 20px;
            font-size: 1.25em;
            font-weight: 700;
            border-bottom: 2px solid #667eea;
            padding-bottom: 12px;
            grid-column: 1 / -1;
            letter-spacing: -0.3px;
        }

        .scores-container {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 20px;
        }

        .score-item {
            display: flex;
            justify-content: space-between;
            padding: 12px 0;
            border-bottom: 1px solid #f0f0f0;
        }

        .score-item:last-child {
            border-bottom: none;
        }

        .score-label {
            color: #555;
            font-weight: 500;
            font-size: 0.95em;
        }

        .score-value {
            color: #667eea;
            font-weight: 600;
            font-size: 1.1em;
        }

        .top-students {
            background: linear-gradient(135deg, #f8f9ff 0%, #f5f7ff 100%);
            padding: 28px;
            border-radius: 14px;
            border: 1px solid #e8ecff;
            box-shadow: 0 4px 15px rgba(0, 0, 0, 0.03);
        }

        .top-students h3 {
            color: #333;
            margin-bottom: 20px;
            font-size: 1.25em;
            font-weight: 700;
            border-bottom: 2px solid #667eea;
            padding-bottom: 12px;
            letter-spacing: -0.3px;
        }

        .grade-distribution {
            background: linear-gradient(135deg, #f8f9ff 0%, #f5f7ff 100%);
            padding: 28px;
            border-radius: 14px;
            margin-bottom: 25px;
            border: 1px solid #e8ecff;
            box-shadow: 0 4px 15px rgba(0, 0, 0, 0.03);
        }

        .grade-distribution h3 {
            color: #333;
            margin-bottom: 20px;
            font-size: 1.25em;
            font-weight: 700;
            border-bottom: 2px solid #667eea;
            padding-bottom: 12px;
            letter-spacing: -0.3px;
        }

        .grade-item {
            display: flex;
            align-items: center;
            margin-bottom: 14px;
            padding: 12px 14px;
            background: white;
            border-radius: 10px;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
            transition: all 0.2s ease;
        }

        .grade-item:hover {
            box-shadow: 0 4px 12px rgba(102, 126, 234, 0.1);
            transform: translateX(2px);
        }

        .grade-label {
            min-width: 45px;
            font-weight: 700;
            color: #667eea;
            font-size: 1.05em;
        }

        .grade-bar {
            height: 22px;
            background: linear-gradient(90deg, #667eea 0%, #764ba2 100%);
            margin: 0 14px;
            border-radius: 6px;
            position: relative;
            overflow: hidden;
            min-width: 50px;
            box-shadow: 0 2px 8px rgba(102, 126, 234, 0.15);
        }

        .grade-info {
            min-width: 90px;
            text-align: right;
            color: #666;
            font-size: 0.9em;
            font-weight: 500;
        }

        .top-student-item {
            padding: 14px 16px;
            background: white;
            margin-bottom: 12px;
            border-radius: 10px;
            border-left: 4px solid #667eea;
            display: flex;
            justify-content: space-between;
            align-items: center;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
            transition: all 0.2s ease;
        }

        .top-student-item:hover {
            box-shadow: 0 4px 12px rgba(102, 126, 234, 0.1);
            transform: translateX(2px);
        }

        .student-rank {
            font-weight: 700;
            color: #667eea;
            font-size: 1.15em;
            min-width: 35px;
        }

        .student-info {
            flex-grow: 1;
            margin-left: 16px;
        }

        .student-name {
            font-weight: 600;
            color: #333;
        }

        .student-grade {
            font-size: 0.9em;
            color: #999;
        }

        .student-input-section {
            background: linear-gradient(135deg, #f8f9ff 0%, #f5f7ff 100%);
            border-radius: 12px;
            padding: 18px;
            box-shadow: 0 4px 15px rgba(0, 0, 0, 0.03);
            display: flex;
            gap: 10px;
            border: 1px solid #e8ecff;
            margin-bottom: 15px;
        }

        .student-input-section input {
            flex: 1;
            padding: 12px 14px;
            border: 1.5px solid #d0d7ff;
            border-radius: 8px;
            font-size: 0.95em;
            outline: none;
            transition: all 0.2s ease;
        }

        .student-input-section input:focus {
            border-color: #667eea;
            box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
        }

        .student-input-section button {
            padding: 11px 20px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            border: none;
            border-radius: 8px;
            cursor: pointer;
            font-weight: 600;
            transition: all 0.2s ease;
            box-shadow: 0 4px 15px rgba(102, 126, 234, 0.3);
            white-space: nowrap;
            font-size: 0.95em;
        }

        .student-input-section button:hover {
            transform: translateY(-2px);
            box-shadow: 0 6px 20px rgba(102, 126, 234, 0.4);
        }

        .student-input-section button:active {
            transform: translateY(0);
        }

        .current-student {
            color: #667eea;
            font-weight: bold;
        }

        .semester-ranks-section {
            background: linear-gradient(135deg, #f8f9ff 0%, #f5f7ff 100%);
            border-radius: 12px;
            padding: 14px;
            margin-bottom: 18px;
            border: 1px solid #e8ecff;
            box-shadow: 0 4px 15px rgba(0, 0, 0, 0.03);
        }

        .semester-ranks-section h3 {
            color: #333;
            font-size: 0.95em;
            font-weight: 700;
            margin-bottom: 12px;
            padding-bottom: 10px;
            border-bottom: 2px solid #667eea;
            letter-spacing: -0.3px;
        }

        .semester-rank-item {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 10px 0;
            border-bottom: 1px solid #f0f0f0;
        }

        .semester-rank-item:last-child {
            border-bottom: none;
        }

        .semester-rank-label {
            color: #555;
            font-weight: 500;
            font-size: 0.9em;
        }

        .semester-rank-value {
            color: #667eea;
            font-weight: 700;
            font-size: 1em;
            min-width: 50px;
            text-align: right;
        }

        .student-score {
            font-weight: bold;
            color: #667eea;
        }

        @media (max-width: 768px) {
            .content {
                grid-template-columns: 1fr;
            }

            .stats-grid {
                grid-template-columns: 1fr;
            }

            h1 {
                font-size: 1.8em;
            }
        }

        .loading {
            text-align: center;
            padding: 40px;
            color: #666;
        }

        .error {
            background: #fee;
            color: #c33;
            padding: 15px;
            border-radius: 4px;
            margin-bottom: 20px;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="content">
            <div>
                <div class="student-input-section">
                    <input
                        type="text"
                        id="studentInput"
                        placeholder="학번을 입력하세요"
                    />
                    <button onclick="loadStudent()">조회</button>
                </div>
                <div id="semesterRanksSection" style="display: none;" class="semester-ranks-section">
                    <h3>학기별 석차</h3>
                    <div id="semesterRanks"></div>
                </div>
                <div class="courses-list" id="coursesList">
                    <h2>과목 목록</h2>
                    <div class="loading">로드 중...</div>
                </div>
            </div>
            <div class="detail-panel" id="detailPanel">
                <div class="empty">
                    <div style="text-align: center;">
                        <h2 style="color: #667eea; margin-bottom: 15px;">상세 성적 조회 시스템</h2>
                        <p style="color: #999; font-size: 1.1em; margin-bottom: 30px;">
                            좌측 목록에서 과목을 선택하면<br>
                            상세한 성적 정보를 확인할 수 있습니다.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <script>
        let courses = [];
        let selectedCourse = null;
        let currentStudent = null;

        async function loadStudent() {
            const stuno = document.getElementById("studentInput").value.trim();

            if (!stuno) {
                alert("학번을 입력하세요");
                return;
            }

            try {
                const button = event.target;
                button.disabled = true;
                button.textContent = "수집 중...";

                const response = await fetch('/api/collect/' + stuno);
                if (!response.ok) {
                    throw new Error("데이터 수집 실패");
                }

                const result = await response.json();
                currentStudent = stuno;
                await loadCourses();
                
                button.disabled = false;
                button.textContent = "조회";
            } catch (error) {
                alert(error.message);
                const button = event.target;
                button.disabled = false;
                button.textContent = "조회";
            }
        }

        async function loadCourses() {
            try {
                const response = await fetch('/api/courses?stuno=' + currentStudent);
                courses = await response.json();

                try {
                    const gradesPath = '/api/grades/' + currentStudent;
                    const gradesResponse = await fetch(gradesPath);
                    if (gradesResponse.ok) {
                        const gradesData = await gradesResponse.json();
                        const semesterRanksSection = document.getElementById('semesterRanksSection');
                        const semesterRanksDiv = document.getElementById('semesterRanks');
                        
                        if (gradesData.length > 0) {
                            let html = '';
                            gradesData.forEach(semester => {
                                const semesterText = semester.SHTM_CD === '10' ? '1학기' : '2학기';
                                const rankValue = semester.SUST_RANK ? semester.SUST_RANK + '등' : '미상';
                                html += \`
                                    <div class="semester-rank-item">
                                        <span class="semester-rank-label">\${semester.YY}년 \${semesterText}</span>
                                        <span class="semester-rank-value">\${rankValue}</span>
                                    </div>
                                \`;
                            });
                            
                            semesterRanksDiv.innerHTML = html;
                            semesterRanksSection.style.display = 'block';
                        }
                    }
                } catch (e) {
                    console.log('석차 데이터 로드 불가:', e);
                }

                const coursesList = document.getElementById('coursesList');
                coursesList.innerHTML = '<h2>과목 목록</h2>';

                const grouped = {};
                courses.forEach(course => {
                    const key = course.yy + "-" + course.shtmCd;
                    if (!grouped[key]) grouped[key] = [];
                    grouped[key].push(course);
                });

                Object.entries(grouped).sort().forEach(([key, items]) => {
                    const [yy, shtm] = key.split('-');
                    const semester = shtm === '10' ? '1학기' : '2학기';
                    
                    const header = document.createElement('div');
                    header.style.fontWeight = 'bold';
                    header.style.marginTop = '15px';
                    header.style.marginBottom = '8px';
                    header.style.color = '#667eea';
                    header.textContent = yy + "년 " + semester;
                    coursesList.appendChild(header);

                    items.forEach(course => {
                        const item = document.createElement('div');
                        item.className = 'course-item';
                        item.innerHTML = \`
                            <div class="course-name">\${course.courseName}</div>
                            <div class="course-meta" style="font-size: 0.9em; color: #999; margin-top: 2px;">
                                \${course.instructor || '교수명 미상'} | \${course.division || '이수구분 미상'}
                            </div>
                            <div class="course-meta">점수: \${course.myScore.toFixed(2)} | 석차: \${course.myRank}/\${course.totalStudents}</div>
                        \`;
                        item.onclick = () => selectCourse(course);
                        coursesList.appendChild(item);
                    });
                });
            } catch (error) {
                console.error('과목 목록 로드 실패:', error);
            }
        }

        async function selectCourse(course) {
            selectedCourse = course;
            
            try {
                const response = await fetch('/api/courses/' + course.id + '?stuno=' + currentStudent);
                const data = await response.json();

                const detailPanel = document.getElementById('detailPanel');
                const percentile = data.percentile;
                const shtmText = data.SHTM_CD === '10' ? '1학기' : '2학기';

                detailPanel.innerHTML = \`
                    <div class="detail-header">
                        <h2>\${data.KOR_SBJT_NM}</h2>
                        <div class="semester-info">\${data.YY}년 \${shtmText} | 강의번호: \${data.LECT_NO}</div>
                        <div class="semester-info" style="color: #666; margin-top: 5px;">교수: \${data.STF_NM || '미상'} | 이수: \${data.CPTN_DIV_NM || '미상'}</div>
                    </div>

                    <div class="stats-grid">
                        <div class="stat-card">
                            <div class="stat-value">\${data.rank} <span style="font-size: 0.6em; opacity: 0.8;">/ \${data.totalStudents}</span></div>
                            <div class="stat-label">석차</div>
                        </div>
                        <div class="stat-card">
                            <div class="stat-value">\${data.myData.totalScore.toFixed(2)}</div>
                            <div class="stat-label">총점</div>
                        </div>
                        <div class="stat-card">
                            <div class="stat-value">\${percentile.toFixed(1)}%</div>
                            <div class="stat-label">상위 퍼센트</div>
                        </div>
                    </div>

                    <div class="grade-distribution">
                        <h3>성적 분포</h3>
                        \${data.gradeDistribution.map(item => \`
                            <div class="grade-item">
                                <div class="grade-label">\${item.grade}</div>
                                <div class="grade-bar" style="width: \${item.percentage}%;"></div>
                                <div class="grade-info">\${item.count}명 (\${item.percentage}%)</div>
                            </div>
                        \`).join('')}
                    </div>

                    <div class="scores-section">
                        <h3>성적 세부사항</h3>
                        <div class="scores-container">
                            <div>
                                <div class="score-item">
                                    <span class="score-label">성적 등급</span>
                                    <span class="score-value">\${data.myData.grade}</span>
                                </div>
                                <div class="score-item">
                                    <span class="score-label">출석점수</span>
                                    <span class="score-value">\${data.myData.scores.attendance}</span>
                                </div>
                                <div class="score-item">
                                    <span class="score-label">중간고사</span>
                                    <span class="score-value">\${data.myData.scores.midterm}</span>
                                </div>
                                <div class="score-item">
                                    <span class="score-label">기말고사</span>
                                    <span class="score-value">\${data.myData.scores.final}</span>
                                </div>
                            </div>
                            <div>
                                <div class="score-item">
                                    <span class="score-label">과제점수</span>
                                    <span class="score-value">\${data.myData.scores.homework}</span>
                                </div>
                                <div class="score-item">
                                    <span class="score-label">퀴즈점수</span>
                                    <span class="score-value">\${data.myData.scores.quiz}</span>
                                </div>
                                <div class="score-item">
                                    <span class="score-label">기타점수</span>
                                    <span class="score-value">\${data.myData.scores.etc}</span>
                                </div>
                                <div class="score-item">
                                    <span class="score-label">가산점</span>
                                    <span class="score-value">\${data.myData.scores.extra}</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- 상위 5명 섹션 (주석처리)
                    <div class="top-students">
                        <h3>상위 5명</h3>
                        \${data.topStudents.map(student => \`
                            <div class="top-student-item">
                                <div class="student-rank">#\${student.rank}</div>
                                <div class="student-info">
                                    <div class="student-name">\${student.name}</div>
                                    <div class="student-grade">\${student.grade}</div>
                                </div>
                                <div class="student-score">\${student.score.toFixed(2)}</div>
                            </div>
                        \`).join('')}
                    </div>
                    -->
                \`;
            } catch (error) {
                console.error('과목 정보 로드 실패:', error);
            }
        }
    </script>
</body>
</html>
  `;

  res.send(html);
});

app.listen(PORT, () => {
  console.log(`http://localhost:${PORT}`);
});
