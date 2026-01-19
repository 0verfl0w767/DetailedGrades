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
  const stuno = req.query.stuno || config.STUDENT_ID;
  const analysisData = loadAnalysisData(stuno);

  if (!analysisData) {
    return res.status(404).json({ error: "학생 데이터를 로드할 수 없습니다" });
  }

  const courses = analysisData.map((course, index) => ({
    id: index,
    courseName: course.KOR_SBJT_NM,
    yy: course.YY,
    shtmCd: course.SHTM_CD,
    myScore: course.myData.totalScore,
    myRank: course.rank,
    totalStudents: course.totalStudents,
  }));

  res.json(courses);
});

app.get("/api/courses/:id", (req, res) => {
  const { id } = req.params;
  const stuno = req.query.stuno || config.STUDENT_ID;
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
            scrollbar-gutter: stable;
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
            border-radius: 10px;
            padding: 30px;
            box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2);
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
            border-bottom: 3px solid #667eea;
            padding-bottom: 20px;
            margin-bottom: 20px;
        }

        .detail-header h2 {
            color: #333;
            font-size: 1.8em;
            margin-bottom: 10px;
        }

        .semester-info {
            color: #666;
            font-size: 0.95em;
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
            padding: 20px;
            border-radius: 8px;
            text-align: center;
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
            background: #f9f9f9;
            padding: 20px;
            border-radius: 8px;
            margin-bottom: 20px;
        }

        .scores-section h3 {
            color: #333;
            margin-bottom: 15px;
            font-size: 1.2em;
            border-bottom: 2px solid #667eea;
            padding-bottom: 10px;
        }

        .score-item {
            display: flex;
            justify-content: space-between;
            padding: 10px 0;
            border-bottom: 1px solid #eee;
        }

        .score-item:last-child {
            border-bottom: none;
        }

        .score-label {
            color: #666;
            font-weight: 500;
        }

        .score-value {
            color: #667eea;
            font-weight: bold;
            font-size: 1.1em;
        }

        .top-students {
            background: #f0f4ff;
            padding: 20px;
            border-radius: 8px;
        }

        .top-students h3 {
            color: #333;
            margin-bottom: 15px;
            font-size: 1.2em;
            border-bottom: 2px solid #667eea;
            padding-bottom: 10px;
        }

        .top-student-item {
            padding: 12px;
            background: white;
            margin-bottom: 10px;
            border-radius: 4px;
            border-left: 3px solid #ffc107;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }

        .student-rank {
            font-weight: bold;
            color: #ffc107;
            font-size: 1.2em;
            min-width: 30px;
        }

        .student-info {
            flex-grow: 1;
            margin-left: 15px;
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
            background: white;
            border-radius: 10px;
            padding: 20px;
            box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2);
            margin-bottom: 20px;
            display: flex;
            gap: 10px;
        }

        .student-input-section input {
            flex: 1;
            padding: 10px;
            border: 2px solid #667eea;
            border-radius: 5px;
            font-size: 1em;
        }

        .student-input-section button {
            padding: 10px 20px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            border: none;
            border-radius: 5px;
            cursor: pointer;
            font-weight: bold;
            transition: transform 0.2s;
        }

        .student-input-section button:hover {
            transform: scale(1.05);
        }

        .current-student {
            color: #667eea;
            font-weight: bold;
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
        <div class="student-input-section">
            <input
                type="text"
                id="studentInput"
                placeholder="학번을 입력하세요"
            />
            <button onclick="loadStudent()">조회</button>
        </div>

        <div class="content">
            <div class="courses-list" id="coursesList">
                <h2>과목 목록</h2>
                <div class="loading">로드 중...</div>
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
                            <div class="course-meta">점수: \${course.myScore.toFixed(2)} | 등수: \${course.myRank}/\${course.totalStudents}</div>
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
                    </div>

                    <div class="stats-grid">
                        <div class="stat-card">
                            <div class="stat-value">\${data.rank} <span style="font-size: 0.6em; opacity: 0.8;">/ \${data.totalStudents}</span></div>
                            <div class="stat-label">등수</div>
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

                    <div class="scores-section">
                        <h3>성적 세부사항</h3>
                        <div class="score-item">
                            <span class="score-label">성적 등급</span>
                            <span class="score-value">\${data.myData.grade}</span>
                        </div>
                        <div class="score-item">
                            <span class="score-label">과제점수</span>
                            <span class="score-value">\${data.myData.scores.homework}</span>
                        </div>
                        <div class="score-item">
                            <span class="score-label">중간고사</span>
                            <span class="score-value">\${data.myData.scores.midterm}</span>
                        </div>
                        <div class="score-item">
                            <span class="score-label">기말고사</span>
                            <span class="score-value">\${data.myData.scores.final}</span>
                        </div>
                        <div class="score-item">
                            <span class="score-label">출석점수</span>
                            <span class="score-value">\${data.myData.scores.attendance}</span>
                        </div>
                        <div class="score-item">
                            <span class="score-label">기타점수</span>
                            <span class="score-value">\${data.myData.scores.etc}</span>
                        </div>
                        <div class="score-item">
                            <span class="score-label">퀴즈점수</span>
                            <span class="score-value">\${data.myData.scores.quiz}</span>
                        </div>
                        <div class="score-item">
                            <span class="score-label">가산점</span>
                            <span class="score-value">\${data.myData.scores.extra}</span>
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


        // 페이지 로드 시 과목 목록을 로드하지 않음 (사용자 입력 대기)
    </script>
</body>
</html>
  `;

  res.send(html);
});

app.listen(PORT, () => {
  console.log(`http://localhost:${PORT}`);
});
