import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { TodoService } from './todo.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtUser } from '../auth/jwt.strategy';

@Controller('api/v1/todo')
@UseGuards(JwtAuthGuard)
export class TodoController {
  constructor(private readonly todo: TodoService) {}

  @Get('users')
  listUsers() {
    return this.todo.listUsersWithCounts();
  }

  @Get('users/:userId/tasks')
  listTasks(@Param('userId') userId: string) {
    return this.todo.listTasksForUser(userId);
  }

  @Post('users/:userId/tasks')
  createTask(
    @Param('userId') userId: string,
    @Body() dto: { title: string; priority?: string },
  ) {
    return this.todo.createTask(userId, dto);
  }

  @Post('users/:userId/tasks/reorder')
  reorder(
    @Param('userId') userId: string,
    @Body('orderedIds') orderedIds: string[],
  ) {
    return this.todo.reorderTasks(userId, orderedIds);
  }

  @Patch('tasks/:taskId')
  updateTask(
    @Param('taskId') taskId: string,
    @Body() dto: { title?: string; priority?: string; isDone?: boolean },
  ) {
    return this.todo.updateTask(taskId, dto);
  }

  @Delete('tasks/:taskId')
  deleteTask(@Param('taskId') taskId: string) {
    return this.todo.deleteTask(taskId);
  }

  @Get('tasks/:taskId/notes')
  listNotes(@Param('taskId') taskId: string) {
    return this.todo.listAllNotes(taskId);
  }

  @Post('tasks/:taskId/notes')
  addNote(
    @Param('taskId') taskId: string,
    @Body('content') content: string,
    @CurrentUser() user: JwtUser,
  ) {
    return this.todo.addNote(taskId, content, user.userId);
  }

  @Delete('notes/:noteId')
  deleteNote(@Param('noteId') noteId: string) {
    return this.todo.deleteNote(noteId);
  }
}
