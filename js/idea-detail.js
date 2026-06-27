import { db, auth } from '../js/firebase.js';
import { doc, getDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/12.14.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.14.0/firebase-auth.js";

const urlParams = new URLSearchParams(window.location.search);
const ideaId = urlParams.get('id');
const detailDiv = document.getElementById('ideaDetail');

// ننتظر تحميل حالة المصادقة ثم نتصرف
onAuthStateChanged(auth, async (user) => {
  if (!ideaId) {
    detailDiv.innerHTML = '<p style="color:white;">❌ لا يوجد معرف للفكرة في الرابط</p>';
    return;
  }

  if (!user) {
    detailDiv.innerHTML = '<p style="color:white;">🔒 يجب تسجيل الدخول لعرض التفاصيل</p>';
    return;
  }

  try {
    detailDiv.innerHTML = '<p style="text-align:center; color:white;">⏳ جاري تحميل الفكرة...</p>';
    const docSnap = await getDoc(doc(db, 'ideas', ideaId));

    if (!docSnap.exists()) {
      detailDiv.innerHTML = '<p style="color:white;">❌ الفكرة غير موجودة</p>';
      return;
    }

    const idea = { id: docSnap.id, ...docSnap.data() };

    // التحقق من صلاحية المشاهدة
    const isOwner = idea.userId === user.uid;
    const isPublic = idea.visibility === 'public';
    const isSelected = idea.visibility === 'selected' && idea.allowedUsers?.includes(user.uid);

    if (!isOwner && !isPublic && !isSelected) {
      detailDiv.innerHTML = '<p style="color:white;">🔒 غير مصرح لك بمشاهدة هذه الفكرة</p>';
      return;
    }

    // كل شيء جيد، نعرض التفاصيل
    renderDetail(idea);
  } catch (error) {
    console.error('خطأ في تحميل الفكرة:', error);
    detailDiv.innerHTML = `<p style="color:white;">⚠️ حدث خطأ: ${error.message}</p>`;
  }
});

function renderDetail(idea) {
  const imagesHTML = idea.imageUrls?.map(url =>
    `<img src="${url}" alt="${idea.title}" onclick="window.open('${url}')">`
  ).join('') || '';

  const audioHTML = idea.audioUrl ? `
    <div class="detail-audio">
      <h3>🎵 التسجيل الصوتي</h3>
      <audio controls src="${idea.audioUrl}"></audio>
    </div>
  ` : '';

  const tagsHTML = idea.tags?.map(tag => `<span class="tag">${tag}</span>`).join('') || '';

  detailDiv.innerHTML = `
    <h1 class="detail-title">${idea.title}</h1>
    <p class="detail-description">${idea.description}</p>
    ${tagsHTML ? `<div class="detail-tags">${tagsHTML}</div>` : ''}
    ${imagesHTML ? `<div class="detail-images">${imagesHTML}</div>` : ''}
    ${audioHTML}
    <div class="action-buttons">
      <button class="edit-btn" onclick="window.location.href='../index.html?edit=${idea.id}'">✏️ تعديل</button>
      <button class="share-btn" id="shareIdeaBtn">📤 مشاركة</button>
      <button class="print-btn" onclick="window.print()">🖨️ طباعة</button>
      <button class="delete-btn" id="deleteIdeaBtn">🗑️ حذف</button>
    </div>
  `;

  document.getElementById('shareIdeaBtn').onclick = () => {
    if (navigator.share) {
      navigator.share({
        title: idea.title,
        text: idea.description,
        url: window.location.href
      }).catch(console.error);
    } else {
      alert('المشاركة غير مدعومة');
    }
  };

  document.getElementById('deleteIdeaBtn').onclick = async () => {
    if (confirm('متأكد من حذف الفكرة؟')) {
      await deleteDoc(doc(db, 'ideas', ideaId));
      alert('تم الحذف');
      window.location.href = '../index.html';
    }
  };
}